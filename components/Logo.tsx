import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="https://raw.githubusercontent.com/happyhaplu/Outcraftly-assets/main/1764808676915.jpg"
      alt="Outcraftly Logo"
      width={240}
      height={72}
      className={className}
      priority
    />
  );
}

export default Logo;
