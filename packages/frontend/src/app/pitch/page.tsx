"use client";

import { Deck } from "~/components/pitch/Deck";
import { PITCH_SLIDES } from "~/components/pitch/slides";

export default function PitchPage() {
  return <Deck slides={PITCH_SLIDES} />;
}
