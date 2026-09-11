import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import {
  fetchAppUpdateManifest,
  isVersionOlder,
  resolveApkDownloadUrl,
} from '@viora/core';

const DISMISS_KEY = 'viora.update.dismissedVersion';

const DEFAULT_WEB_ORIGIN = 'https://vioradev.netlify.app';

function currentAppVersion(): string {
  return (
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '0.0.0'
  );
}

function webOrigin(): string {
  return (
    process.env.EXPO_PUBLIC_WEB_API_URL ||
    process.env.EXPO_PUBLIC_UPDATE_MANIFEST_ORIGIN ||
    DEFAULT_WEB_ORIGIN
  ).replace(/\/$/, '');
}

function manifestUrl(): string {
  if (process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL) {
    return process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL;
  }
  return `${webOrigin()}/app-update.json`;
}

/**
 * Soft update prompt for sideloaded Android APKs.
 * Does not auto-install — opens the download URL when the user accepts.
 */
export function AppUpdateChecker() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked || Platform.OS === 'web') return;
    let active = true;

    void (async () => {
      try {
        const manifest = await fetchAppUpdateManifest(manifestUrl());
        if (!active) return;

        const current = currentAppVersion();
        const latest = manifest.latestVersion;
        if (!isVersionOlder(current, latest)) {
          setChecked(true);
          return;
        }

        const dismissed = await AsyncStorage.getItem(DISMISS_KEY);
        const force =
          Boolean(manifest.minVersion) && isVersionOlder(current, manifest.minVersion!);

        if (!force && dismissed === latest) {
          setChecked(true);
          return;
        }

        const apkUrl = resolveApkDownloadUrl(manifest, webOrigin());
        const message =
          manifest.notes?.trim() ||
          `Version ${latest} is available (you have ${current}). Download and install the new APK.`;

        Alert.alert(
          force ? 'Update required' : 'Update available',
          message,
          [
            ...(force
              ? []
              : [
                  {
                    text: 'Later',
                    style: 'cancel' as const,
                    onPress: () => {
                      void AsyncStorage.setItem(DISMISS_KEY, latest);
                    },
                  },
                ]),
            {
              text: 'Download',
              onPress: () => {
                if (apkUrl) {
                  void Linking.openURL(apkUrl);
                } else {
                  void Linking.openURL(`${webOrigin()}/app`);
                }
              },
            },
          ],
          { cancelable: !force },
        );
      } catch {
        /* offline / manifest missing — ignore */
      } finally {
        if (active) setChecked(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [checked]);

  return null;
}
