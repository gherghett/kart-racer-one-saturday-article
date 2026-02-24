import type { ObjectDefinition } from "./types";
import { exampleCart } from "./example-cart";
import { wonkyKart } from "./wonky-kart";
import { firetruck } from "./firetruck";

export const registry: ObjectDefinition[] = [exampleCart, wonkyKart, firetruck];
