"use client";
import { useEffect } from "react";
import { serviceWorkerContainer } from "@/lib/service-worker";
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
      try {
        serviceWorkerContainer()?.controller?.postMessage({
          type: "OFFLINE",
          value: localStorage.getItem("eira-offline") === "true",
        });
      } catch {}
    };
    const worker = serviceWorkerContainer();
    worker?.addEventListener("controllerchange", update);
    update();
    return () => {
      window.fetch = original;
      worker?.removeEventListener("controllerchange", update);
    };
  }, []);
  return null;
}
