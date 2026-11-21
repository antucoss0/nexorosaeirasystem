"use client";
import { useEffect } from "react";
export function NetworkGuard() {
  useEffect(() => {
    const original = window.fetch;
    window.fetch = (...args) => {
      if (!navigator.onLine || localStorage.getItem("eira-offline") === "true")
        return Promise.reject(
          new Error("Modo sin conexión: solicitud bloqueada"),
        );
      return original(...args);
    };
    const update = () => {
      navigator.serviceWorker?.controller?.postMessage({
        type: "OFFLINE",
        value: localStorage.getItem("eira-offline") === "true",
      });
    };
    navigator.serviceWorker?.addEventListener("controllerchange", update);
    update();
    return () => {
      window.fetch = original;
      navigator.serviceWorker?.removeEventListener("controllerchange", update);
    };
  }, []);
  return null;
}
