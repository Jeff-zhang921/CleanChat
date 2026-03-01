type NotificationPermissionState = NotificationPermission | "unsupported";

const isSupported = () => typeof window !== "undefined" && "Notification" in window;
const hasServiceWorker = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;
const DEBUG_PREFIX = "[CleanChat][notifications]";

export const getNotificationPermission = (): NotificationPermissionState => {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
};

export const requestNotificationPermission = async (): Promise<NotificationPermissionState> => {
  if (!isSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
};

export const showMessageNotification = async (
  title: string,
  body: string,
  tag?: string
): Promise<boolean> => {
  if (!isSupported() || Notification.permission !== "granted") return false;

  try {
    if (hasServiceWorker()) {
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await Promise.race<ServiceWorkerRegistration | undefined>([
          navigator.serviceWorker.ready,
          new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), 4000)),
        ]);
      }

      if (registration) {
        try {
          await registration.showNotification(title, {
            body,
            tag,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            data: { url: "/conversations" },
          });
          return true;
        } catch (swError) {
          console.warn(`${DEBUG_PREFIX} service worker showNotification failed`, swError);
        }
      }
    }

    try {
      const notification = new Notification(title, {
        body,
        tag,
        icon: "/icons/icon-192.png",
      });
      notification.onclick = () => window.focus();
      return true;
    } catch (domError) {
      console.warn(`${DEBUG_PREFIX} Notification constructor failed`, domError);
      return false;
    }
  } catch (error) {
    console.warn(`${DEBUG_PREFIX} unexpected notification error`, error);
    return false;
  }
};
