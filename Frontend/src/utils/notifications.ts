type NotificationPermissionState = NotificationPermission | "unsupported";

const isSupported = () => typeof window !== "undefined" && "Notification" in window;

export const getNotificationPermission = (): NotificationPermissionState => {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
};

export const requestNotificationPermission = async (): Promise<NotificationPermissionState> => {
  if (!isSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
};

export const showMessageNotification = (title: string, body: string, tag?: string): boolean => {
  if (!isSupported() || Notification.permission !== "granted") return false;

  try {
    const notification = new Notification(title, {
      body,
      tag,
      icon: "/favicon.ico",
    });
    notification.onclick = () => window.focus();
    return true;
  } catch {
    return false;
  }
};
