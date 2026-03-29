/**
 * Ensures EXPO_PUBLIC_API_URL from .env is available at runtime via expo-constants `extra`
 * (Metro sometimes omits env for EXPO_PUBLIC_* until a clean restart; `extra` is reliable).
 */
module.exports = ({ config }) => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      apiUrl: fromEnv && fromEnv.length > 0 ? fromEnv : "http://10.0.2.2:8787/v1"
    }
  };
};
