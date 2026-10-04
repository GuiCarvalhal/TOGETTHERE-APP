import React from 'react';
import { Image } from '@/components/ui/image';

// Exact user-supplied TOGETTHERE signpost logo assets. The light variant
// (white background JPEG) is shown in light mode; the dark variant (black
// background PNG) in dark mode — swapped via the `.dark` class on <html>,
// so the correct asset renders instantly with no JS or flicker.
const LIGHT_URL =
  'https://media.base44.com/images/public/6aaf0809fb7946eb822b16b4/d129840ee_togethere-logo-light.jpeg';
const DARK_URL =
  'https://media.base44.com/images/public/6aaf0809fb7946eb822b16b4/5adf7fcc5_togethere-logo-dark.png';

export default function BrandLogo({ className = 'w-7 h-7' }) {
  return (
    <>
      <Image
        src={LIGHT_URL}
        alt="TOGETTHERE"
        fittingType="fit"
        className={`${className} block dark:hidden rounded-lg`}
      />
      <Image
        src={DARK_URL}
        alt="TOGETTHERE"
        fittingType="fit"
        className={`${className} hidden dark:block rounded-lg`}
      />
    </>
  );
}