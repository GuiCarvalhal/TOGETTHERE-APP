// Centralized lucide icon map for journey item types. Imported by every
// surface that renders a journey-type icon (Home, Journey timeline, Add
// Segment picker) so Main Event always renders Star and no type falls back
// to a generic MapPin. Keep this in sync with JOURNEY_TYPES in
// gatheringHelpers.js (same keys, same order).
import { Plane, Car, Train, Hotel, Compass, Ship, Star, MapPin } from 'lucide-react';

export const JOURNEY_ICONS = {
  flight: Plane,
  car: Car,
  train: Train,
  hotel: Hotel,
  activity: Compass,
  cruise: Ship,
  main_event: Star,
  other: MapPin,
};

// Resolve a single type to its icon component, falling back to MapPin only for
// an unknown/missing type (never for a known type such as main_event).
export const journeyIcon = (type) => JOURNEY_ICONS[type] || MapPin;