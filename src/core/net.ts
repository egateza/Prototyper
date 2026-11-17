import os from 'node:os';

/** Alamat IPv4 LAN mesin ini (untuk URL mode --lan). */
export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

/**
 * Urutkan alamat LAN dari yang paling mungkin dibuka perangkat lain: 192.168.x (Wi-Fi rumah/kantor),
 * 10.x, lalu 172.16-31.x (sering adaptor WSL/Hyper-V/Docker), lalu sisanya (mis. 169.254 link-local).
 */
export function rankLanAddresses(addrs: string[]): string[] {
  const rank = (a: string) => {
    if (a.startsWith('192.168.')) return 0;
    if (a.startsWith('10.')) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return 2;
    if (a.startsWith('169.254.')) return 4;
    return 3;
  };
  return [...addrs].sort((a, b) => rank(a) - rank(b));
}
