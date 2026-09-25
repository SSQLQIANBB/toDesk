/* Fixed, isolated embedded-CPython entry. No interpreter CLI or test flags. */
#define PY_SSIZE_T_CLEAN
#include <Python.h>
#include <mach-o/dyld.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

extern char **environ;
static char *empty_environment[] = {NULL};

static void checked(PyStatus status) {
    if (PyStatus_Exception(status)) {
        fputs("candidate engine initialization failed\n", stderr);
        exit(2);
    }
}
static void append_path(PyConfig *config, const char *root, const char *suffix) {
    char path[PATH_MAX];
    if (snprintf(path, sizeof(path), "%s/%s", root, suffix) >= sizeof(path)) exit(2);
    wchar_t *wide = Py_DecodeLocale(path, NULL);
    if (!wide) exit(2);
    checked(PyWideStringList_Append(&config->module_search_paths, wide));
    PyMem_RawFree(wide);
}
int main(int argc, char **argv) {
    (void)argv;
    if (argc != 1) { fputs("engine arguments forbidden\n", stderr); return 2; }
    char raw[PATH_MAX], executable[PATH_MAX], root[PATH_MAX], path[PATH_MAX];
    uint32_t size = sizeof(raw);
    if (_NSGetExecutablePath(raw, &size) != 0 || !realpath(raw, executable)) return 2;
    if (strlcpy(root, executable, sizeof(root)) >= sizeof(root)) return 2;
    char *last = strrchr(root, '/');
    if (!last) return 2;
    *last = '\0';
    last = strrchr(root, '/');
    if (!last || strcmp(last + 1, "bin") != 0) return 2;
    *last = '\0';
    environ = empty_environment;
    PyPreConfig pre;
    PyPreConfig_InitIsolatedConfig(&pre);
    pre.utf8_mode = 1;
    checked(Py_PreInitialize(&pre));
    PyConfig config;
    PyConfig_InitIsolatedConfig(&config);
    config.use_environment = 0;
    config.user_site_directory = 0;
    config.site_import = 0;
    config.write_bytecode = 0;
    config.parse_argv = 0;
    config.module_search_paths_set = 1;
    checked(PyConfig_SetBytesString(&config, &config.executable, executable));
    checked(PyConfig_SetBytesString(&config, &config.program_name, executable));
    if (snprintf(path, sizeof(path), "%s/runtime", root) >= sizeof(path)) return 2;
    checked(PyConfig_SetBytesString(&config, &config.home, path));
    append_path(&config, root, "runtime/lib/python3.13");
    append_path(&config, root, "runtime/lib/python3.13/lib-dynload");
    append_path(&config, root, "runtime/site-packages");
    append_path(&config, root, "app");
    if (snprintf(path, sizeof(path), "%s/app/entry.py", root) >= sizeof(path)) return 2;
    checked(PyConfig_SetBytesString(&config, &config.run_filename, path));
    checked(Py_InitializeFromConfig(&config));
    PyConfig_Clear(&config);
    return Py_RunMain();
}
