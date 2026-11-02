import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'secure_storage_service.dart';

class ApiClient {
  /// Toma SIPAR_API_URL desde el archivo .env o usa por defecto tu servidor en Render
  static String get baseUrl {
    if (dotenv.isInitialized) {
      final envUrl = dotenv.env['SIPAR_API_URL']?.trim();
      if (envUrl != null && envUrl.isNotEmpty) {
        return envUrl;
      }
    }
    return const String.fromEnvironment(
      'SIPAR_API_URL',
      defaultValue: 'https://sipar-5cr6.onrender.com',
    );
  }

  /// Toma GOOGLE_MAPS_API_KEY desde el archivo .env si la necesitas en servicios de geocodificación/rutas
  static String get googleMapsApiKey {
    if (dotenv.isInitialized) {
      return dotenv.env['GOOGLE_MAPS_API_KEY']?.trim() ?? '';
    }
    return const String.fromEnvironment(
      'GOOGLE_MAPS_API_KEY',
      defaultValue: '',
    );
  }

  static VoidCallback? onUnauthorized;

  static final Dio dio =
      Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(
              seconds: 45,
            ), // Soporta cold-start de Render Free Tier
            receiveTimeout: const Duration(seconds: 45),
            headers: {
              // Defensas Anti-Caché ISO 27001 (idénticas a tu axios.js web)
              'Cache-Control': 'no-store',
              'Pragma': 'no-cache',
            },
          ),
        )
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) async {
              options.baseUrl = baseUrl;
              final token = await SecureStorageService.getToken();
              if (token != null && token.isNotEmpty) {
                options.headers['Authorization'] = 'Bearer $token';
              }
              return handler.next(options);
            },
            onError: (DioException error, handler) async {
              if (error.response?.statusCode == 401) {
                final path = error.requestOptions.path;
                if (!path.contains('/auth/login') &&
                    !path.contains('/auth/google')) {
                  await SecureStorageService.clearSession(
                    keepBiometricToken: false,
                  );
                  onUnauthorized?.call();
                }
              }
              return handler.next(error);
            },
          ),
        );
}

typedef VoidCallback = void Function();
