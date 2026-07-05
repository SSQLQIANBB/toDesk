import { ref, type Ref } from 'vue';
import type { LocationQueryValue } from 'vue-router';
import type { LoginParams, User } from '@/api/auth';
import { resolvePostLoginPath } from './authNavigation';

type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: User;
  message?: string;
};

type LoginControllerDependencies = {
  login(credentials: LoginParams): Promise<LoginResult>;
  setAuth(user: User, accessToken: string, refreshToken?: string): void;
  navigate(path: string): Promise<unknown> | unknown;
  showSuccess(message: string): void;
  showError(message: string): void;
};

type LoginSubmission = {
  validate(): Promise<unknown> | unknown;
  credentials: LoginParams;
  redirect: LocationQueryValue | LocationQueryValue[] | undefined;
};

export function createLoginController(dependencies: LoginControllerDependencies): {
  loading: Ref<boolean>;
  submit(submission: LoginSubmission): Promise<boolean>;
} {
  const loading = ref(false);

  async function submit(submission: LoginSubmission) {
    if (loading.value) return false;
    loading.value = true;

    try {
      await submission.validate();
      const result = await dependencies.login(submission.credentials);
      dependencies.setAuth(result.user, result.accessToken, result.refreshToken);
      dependencies.showSuccess(result.message || '登录成功');
      await dependencies.navigate(resolvePostLoginPath(submission.redirect));
      return true;
    } catch (error: any) {
      dependencies.showError(error?.message || '登录失败');
      return false;
    } finally {
      loading.value = false;
    }
  }

  return { loading, submit };
}
