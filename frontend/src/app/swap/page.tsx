import { redirect } from 'next/navigation';

// This page used to be a non-functional mock swap UI (hardcoded rate, fake
// balance, a Swap button with no handler). Real AMM swapping already lives
// on /pools, wired to the deployed KaiAMM contract — redirect here instead
// of maintaining a second, fake copy of the same feature.
export default function SwapPage() {
  redirect('/pools');
}
