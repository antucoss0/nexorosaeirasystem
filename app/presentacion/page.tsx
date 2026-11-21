import type { Metadata } from "next";
import { Deck } from "@/components/deck";
import "./deck.css";

export const metadata: Metadata = { title: "Presentación · Nexo Rosa EIRA System" };

export default function Presentacion() {
  return <Deck />;
}
