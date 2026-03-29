/**
 * Ensures EXPO_PUBLIC_API_URL from .env is available at runtime via expo-constants `extra`
 * (Metro sometimes omits env for EXPO_PUBLIC_* until a clean restart; `extra` is reliable).
 *
 * On EAS cloud builds, EXPO_PUBLIC_API_URL must be set for the build’s environment (e.g. Preview);
 * otherwise the APK would fall back to 10.0.2.2 (emulator-only) and real phones cannot create jobs.
 */
module.exports = ({ config }) => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  const onEasCloud = process.env.EAS_BUILD === "true";

  if (onEasCloud && (!fromEnv || fromEnv.length === 0)) {
    throw new Error(
      "EAS build is missing EXPO_PUBLIC_API_URL. Add it for this build profile’s environment " +
        "(expo.dev → Project → Environment variables → Preview or Production), then run eas build again."
    );
  }

  const apiUrl =
    fromEnv && fromEnv.length > 0 ? fromEnv : "http://10.0.2.2:8787/v1";

  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      apiUrl
    }
  };
};
