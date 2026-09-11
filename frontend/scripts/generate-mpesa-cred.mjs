/**
 * generate-mpesa-cred.mjs
 * Generates the Safaricom B2C SecurityCredential by RSA-encrypting
 * the initiator password with the Safaricom sandbox certificate.
 *
 * Usage:
 *   node scripts/generate-mpesa-cred.mjs [password]
 *
 * Default sandbox password: Safaricom999!
 * Default sandbox initiator: testapi
 *
 * Output: prints the Base64 SecurityCredential to use in .env.local
 */

import { createPublicKey, publicEncrypt, constants } from "crypto";

// ── Safaricom Sandbox Certificate (public) ────────────────────────────────────
// Source: https://developer.safaricom.co.ke (official sandbox cert)
const SANDBOX_CERT = `-----BEGIN CERTIFICATE-----
MIIGgDCCBWigAwIBAgIKMvrulAAAAARG5DANBgkqhkiG9w0BAQsFADBbMRMwEQYK
CZImiZPyLGQBGRYDbmV0MRkwFwYKCZImiZPyLGQBGRYJc2FmYXJpY29tMSkwJwYD
VQQDEyBTYWZhcmljb20gSW50ZXJuYWwgSXNzdWluZyBDQSAwMjAeFw0xNDExMTIw
NzEyNDVaFw0xNjExMTEwNzEyNDVaMHsxCzAJBgNVBAYTAktFMRAwDgYDVQQIEwdO
YWlyb2JpMRAwDgYDVQQHEwdOYWlyb2JpMRAwDgYDVQQKEwdOYWlyb2JpMRMwEQYD
VQQLEwpUZWNobm9sb2d5MSEwHwYDVQQDExhhcGljcnlwdC5zYWZhcmljb20uY28u
a2UwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCotwV1VxXsd0Q6i2w0
ugw+EPvgJfV6PNyB826Ik3L2lPJLFuzNEEJbGaiTdSe6Xitf/PJUP/q8Nv2dupHL
BkiBHjpQ6f61He8Zdc9fqKDGBLoNhNpBXxbznzI4Yu6hjBGLnF5Al9zMAxTij6wL
GUFswKpizifNbzV+LyIXY4RR2t8lxtqaFKeSx2B8P+eiZbL0wRIDPVC5+s4GdpFf
Y3QIqyLxI2bOyCGl8/XlUuIhVXxhc8Uq132xjfsWljbw4oaMobnB2KN79vMUvyoR
w8OGpga5VoaSFfVuQjSIf5RwW1hitm/8XJvmNEdeY0uKriYwbR8wfwQ3E0AIW1Fl
MMghAgMBAAGjggMkMIIDIDAdBgNVHQ4EFgQUwUfE+NgGndWDN3DyVp+CAiF1Zkgw
HwYDVR0jBBgwFoAU6zLUT35gmjqYIGO6DV6+6HlO1SQwggE7BgNVHR8EggEyMIIB
LjCCASqgggEmoIIBIoaB1mxkYXA6Ly8vQ049U2FmYXJpY29tJTIwSW50ZXJuYWwl
MjBJc3N1aW5nJTIwQ0ElMjAwMixDTj1TVkRUM0lTU0NBMDEsQ049Q0RQLENOPVB1
YmxpYyUyMEtleSUyMFNlcnZpY2VzLENOPVNlcnZpY2VzLENOPUNvbmZpZ3VyYXRp
b24sREM9c2FmYXJpY29tLERDPW5ldD9jZXJ0aWZpY2F0ZVJldm9jYXRpb25MaXN0
P2Jhc2U/b2JqZWN0Q2xhc3M9Y1JMRGlzdHJpYnV0aW9uUG9pbnSGR2h0dHA6Ly9j
cmwuc2FmYXJpY29tLmNvLmtlL1NhZmFyaWNvbSUyMEludGVybmFsJTIwSXNzdWlu
ZyUyMENBJTIwMDIuY3JsMIIBCQYIKwYBBQUHAQEEgfwwgfkwgckGCCsGAQUFBzAC
hoG8bGRhcDovLy9DTj1TYWZhcmljb20lMjBJbnRlcm5hbCUyMElzc3VpbmclMjBD
QSUyMDAyLENOPUFJQSxDTj1QdWJsaWMlMjBLZXklMjBTZXJ2aWNlcyxDTj1TZXJ2
aWNlcyxDTj1Db25maWd1cmF0aW9uLERDPXNhZmFyaWNvbSxEQz1uZXQ/Y0FDZXJ0
aWZpY2F0ZT9iYXNlP29iamVjdENsYXNzPWNlcnRpZmljYXRpb25BdXRob3JpdHkw
KwYIKwYBBQUHMAGGH2h0dHA6Ly9jcmwuc2FmYXJpY29tLmNvLmtlL29jc3AwCwYD
VR0PBAQDAgWgMD0GCSsGAQQBgjcVBwQwMC4GJisGAQQBgjcVCIfPjFaEwsQDhemF
NoTe0Q2GoIgIZ4bBx2yDublrAgFkAgEMMB0GA1UdJQQWMBQGCCsGAQUFBwMCBggr
BgEFBQcDATAnBgkrBgEEAYI3FQoEGjAYMAoGCCsGAQUFBwMCMAoGCCsGAQUFBwMB
MA0GCSqGSIb3DQEBCwUAA4IBAQBMFKlncYDI06ziR0Z0/reptIJRCMo+rqo/cUuP
KMmJCY3sXxFHs5ilNXo8YavgRLpxJxdZMkiUIVuVaBanXkz9/nMriiJJwwcMPjUV
9nQqwNUEqrSx29L1ARFdUy7LhN4NV7mEMde3MQybCQgBjjOPcVSVZXnaZIggDYIU
w4THLy9rDmUIasC8GDdRcVM8xDOVQD/Pt5qlx/LSbTNe2fekhTLFIGYXJVz2rcsj
k1BfG7P3pXnsPAzu199UZnqhEF+y/0/nNpf3ftHZjfX6Ws+dQuLoDN6pIl8qmok9
9E/EAgL1zOIzFvCRYlnjKdnsuqL1sIYFBlv3oxo6W1O+X9IZ
-----END CERTIFICATE-----`;

// ── Encrypt ────────────────────────────────────────────────────────────────────
function generateSecurityCredential(password, cert) {
  const publicKey = createPublicKey({ key: cert, format: "pem" });
  const encrypted = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(password, "utf8"),
  );
  return encrypted.toString("base64");
}

// ── Main ───────────────────────────────────────────────────────────────────────
const password = process.argv[2] ?? "Safaricom999!";
console.log("\n─────────────────────────────────────────────");
console.log("  M-Pesa B2C Security Credential Generator");
console.log("─────────────────────────────────────────────");
console.log(`  Environment : Sandbox`);
console.log(`  Initiator   : testapi`);
console.log(`  Password    : ${"*".repeat(password.length)} (${password.length} chars)`);

try {
  const cred = generateSecurityCredential(password, SANDBOX_CERT);
  console.log(`\n  ✓ SecurityCredential:\n`);
  console.log(`  ${cred}`);
  console.log(`\n  Copy the above value into .env.local:`);
  console.log(`  MPESA_SECURITY_CRED=${cred}`);
  console.log("─────────────────────────────────────────────\n");

  // Write directly to .env.local
  import("fs").then(({ readFileSync, writeFileSync, existsSync }) => {
    import("path").then(({ resolve, dirname }) => {
      import("url").then(({ fileURLToPath }) => {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const envPath   = resolve(__dirname, "..", ".env.local");
        if (!existsSync(envPath)) {
          console.log("  ⚠️  .env.local not found — skipping auto-write");
          return;
        }
        let env = readFileSync(envPath, "utf8");
        if (env.includes("MPESA_SECURITY_CRED=")) {
          env = env.replace(/^MPESA_SECURITY_CRED=.*$/m, `MPESA_SECURITY_CRED=${cred}`);
        } else {
          env += `\nMPESA_SECURITY_CRED=${cred}\n`;
        }
        writeFileSync(envPath, env, "utf8");
        console.log("  ✓ .env.local updated with MPESA_SECURITY_CRED");
      });
    });
  });
} catch (e) {
  console.error("  ❌ Failed:", e.message);
  process.exit(1);
}
