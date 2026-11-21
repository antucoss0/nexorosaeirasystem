"use client";
import { useEffect } from "react";
import {
  registerOptionalServiceWorker,
  serviceWorkerContainer,
} from "@/lib/service-worker";
export function NetworkGuard() {
  useEffect(() => {
    // Simulated offline belongs to the field workspace; a public page always starts connected,
    // otherwise a forgotten switch blocks sign-in and every page that is not stored.
    if (!/^\/(campo|admin)(\/|$)/.test(location.pathname))
      localStorage.removeItem("eira-offline");
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
    // Registered on every page so the public ones are available offline too.
    void registerOptionalServiceWorker(
      location.hostname,
      process.env.NEXT_PUBLIC_ENABLE_SW,
    );
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
