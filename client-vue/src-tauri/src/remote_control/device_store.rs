//! Private seeds only enter the OS credential store and native process memory.
//! Never use a file fallback, expose seed bytes through invoke, or silently replace
//! an unreadable identity (that would rotate the registered device's key).
use zeroize::Zeroizing;

const SERVICE: &str = "top.sycsq.todesk.remote-device.ed25519.v1";
pub(super) trait SeedStore {
    fn read(&self, user_id: u64) -> Result<Option<Zeroizing<Vec<u8>>>, &'static str>;
    fn write(&self, user_id: u64, seed: &[u8]) -> Result<(), &'static str>;
}
pub(super) struct OsSeedStore;

#[cfg(target_os = "macos")]
impl SeedStore for OsSeedStore {
    fn read(&self, user_id: u64) -> Result<Option<Zeroizing<Vec<u8>>>, &'static str> {
        match security_framework::passwords::get_generic_password(SERVICE, &user_id.to_string()) {
            Ok(value) => Ok(Some(Zeroizing::new(value))),
            Err(error) if error.code() == -25300 => Ok(None), // errSecItemNotFound only
            Err(_) => Err("REMOTE_KEYSTORE_UNAVAILABLE"),
        }
    }
    fn write(&self, user_id: u64, seed: &[u8]) -> Result<(), &'static str> {
        security_framework::passwords::set_generic_password(SERVICE, &user_id.to_string(), seed)
            .map_err(|_| "REMOTE_KEYSTORE_UNAVAILABLE")
    }
}

#[cfg(target_os = "windows")]
impl SeedStore for OsSeedStore {
    fn read(&self, user_id: u64) -> Result<Option<Zeroizing<Vec<u8>>>, &'static str> {
        use windows_sys::Win32::{
            Foundation::{GetLastError, ERROR_NOT_FOUND},
            Security::Credentials::*,
        };
        let target: Vec<u16> = format!("{SERVICE}:{user_id}")
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let mut credential = std::ptr::null_mut();
        unsafe {
            if CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0 {
                return if GetLastError() == ERROR_NOT_FOUND {
                    Ok(None)
                } else {
                    Err("REMOTE_KEYSTORE_UNAVAILABLE")
                };
            }
            let item = &*credential;
            let result = if item.CredentialBlobSize == 32 && !item.CredentialBlob.is_null() {
                Ok(Some(Zeroizing::new(
                    std::slice::from_raw_parts(item.CredentialBlob, 32).to_vec(),
                )))
            } else {
                Err("REMOTE_KEYSTORE_INVALID")
            };
            // CredRead owns this allocation. Wipe the secret before returning it.
            if !item.CredentialBlob.is_null() {
                for offset in 0..item.CredentialBlobSize as usize {
                    std::ptr::write_volatile(item.CredentialBlob.add(offset), 0);
                }
            }
            CredFree(credential.cast());
            result
        }
    }
    fn write(&self, user_id: u64, seed: &[u8]) -> Result<(), &'static str> {
        use windows_sys::Win32::Security::Credentials::*;
        let mut target: Vec<u16> = format!("{SERVICE}:{user_id}")
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let mut account: Vec<u16> = user_id.to_string().encode_utf16().chain(Some(0)).collect();
        let mut bytes = Zeroizing::new(seed.to_vec());
        let mut credential: CREDENTIALW = unsafe { std::mem::zeroed() };
        credential.Type = CRED_TYPE_GENERIC;
        credential.TargetName = target.as_mut_ptr();
        credential.UserName = account.as_mut_ptr();
        credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
        credential.CredentialBlobSize = bytes.len() as u32;
        credential.CredentialBlob = bytes.as_mut_ptr();
        if unsafe { CredWriteW(&credential, 0) } == 0 {
            Err("REMOTE_KEYSTORE_UNAVAILABLE")
        } else {
            Ok(())
        }
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
impl SeedStore for OsSeedStore {
    fn read(&self, _: u64) -> Result<Option<Zeroizing<Vec<u8>>>, &'static str> {
        Err("PLATFORM_UNSUPPORTED")
    }
    fn write(&self, _: u64, _: &[u8]) -> Result<(), &'static str> {
        Err("PLATFORM_UNSUPPORTED")
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    /// Explicit manual integration probe only. No production service/account is
    /// touched; the Drop guard deletes the random test item even on assertion
    /// failure. Ordinary cargo test never invokes a Keychain API.
    #[test]
    #[ignore = "explicit opt-in: writes one temporary Keychain item and removes it"]
    fn temporary_keychain_roundtrip() {
        // The opt-in test must fail instead of showing an unlock/access prompt.
        // This runs in the isolated test process, never in the desktop app.
        #[link(name = "Security", kind = "framework")]
        extern "C" {
            fn SecKeychainGetUserInteractionAllowed(allowed: *mut u8) -> i32;
            fn SecKeychainSetUserInteractionAllowed(allowed: u8) -> i32;
        }
        struct NoPrompt(u8);
        impl Drop for NoPrompt {
            fn drop(&mut self) {
                unsafe {
                    SecKeychainSetUserInteractionAllowed(self.0);
                }
            }
        }
        let mut prior = 0;
        assert_eq!(
            unsafe { SecKeychainGetUserInteractionAllowed(&mut prior) },
            0
        );
        assert_eq!(unsafe { SecKeychainSetUserInteractionAllowed(0) }, 0);
        let _no_prompt = NoPrompt(prior);
        use security_framework::passwords::{
            delete_generic_password, get_generic_password, set_generic_password,
        };
        let mut random = [0u8; 16];
        getrandom::getrandom(&mut random).unwrap();
        let suffix: String = random.iter().map(|b| format!("{b:02x}")).collect();
        let service = format!("top.sycsq.todesk.test-only.{}.{suffix}", std::process::id());
        struct Cleanup(String);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = delete_generic_password(&self.0, "temporary");
            }
        }
        let _cleanup = Cleanup(service.clone());
        let mut seed = Zeroizing::new(vec![0u8; 32]);
        getrandom::getrandom(&mut seed).unwrap();
        set_generic_password(&service, "temporary", &seed).unwrap();
        let loaded = Zeroizing::new(get_generic_password(&service, "temporary").unwrap());
        assert_eq!(*loaded, *seed);
        delete_generic_password(&service, "temporary").unwrap();
        assert_eq!(
            get_generic_password(&service, "temporary")
                .unwrap_err()
                .code(),
            -25300
        );
    }
}
