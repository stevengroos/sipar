import 'dart:io';
import 'package:local_auth/local_auth.dart';

class BiometricService {
  static final LocalAuthentication _auth = LocalAuthentication();

  static Future<bool> isBiometricAvailable() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final isSupported = await _auth.isDeviceSupported();
      if (!canCheck || !isSupported) return false;
      final available = await _auth.getAvailableBiometrics();
      return available.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Devuelve la etiqueta exacta según los sensores del teléfono ("Face ID" o "Huella Digital")
  static Future<String> getBiometricLabel() async {
    try {
      final available = await _auth.getAvailableBiometrics();
      if (available.contains(BiometricType.face)) {
        return Platform.isIOS ? 'Face ID' : 'Reconocimiento Facial';
      }
      if (available.contains(BiometricType.fingerprint) ||
          available.contains(BiometricType.strong) ||
          available.contains(BiometricType.weak)) {
        return Platform.isIOS ? 'Touch ID' : 'Huella Digital';
      }
    } catch (_) {}
    return Platform.isIOS ? 'Face ID' : 'Huella / Biometría';
  }

  /// Valida con el rostro (Face ID) o Huella Digital
  static Future<bool> authenticateWithFaceId({
    bool strictBiometricOnly = true,
  }) async {
    try {
      final available = await _auth.getAvailableBiometrics();
      final label = await getBiometricLabel();

      // Si tiene Face ID o Huella enrolada, exigimos biometría real
      final useStrictBio = strictBiometricOnly && available.isNotEmpty;

      return await _auth.authenticate(
        localizedReason:
            'Valida tu identidad con $label para proteger tu cuenta SIPAR',
        biometricOnly: useStrictBio,
      );
    } catch (_) {
      // Fallback en caso de que el dispositivo bloquee temporalmente el sensor
      if (strictBiometricOnly) {
        try {
          return await _auth.authenticate(
            localizedReason: 'Desbloquea tu cuenta SIPAR con Biometría',
            biometricOnly: false,
          );
        } catch (_) {
          return false;
        }
      }
      return false;
    }
  }
}
