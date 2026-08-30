/**
 * EMVCo PromptPay Dynamic QR Generator with CRC-16 Checksum
 * Standard: Bank of Thailand / PromptPay QR Standard
 */

function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xff;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function formatTag(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${tag}${len}${value}`;
}

export function generatePromptPayPayload(target: string, amount?: number): string {
  // Clean target (Phone 10 digits -> 0066..., TaxID / National ID 13 digits, or e-Wallet 15 digits)
  const cleaned = target.replace(/[^0-9]/g, "");
  let formattedTarget = cleaned;
  let targetType = "01"; // 01 = Phone, 02 = Tax ID / Citizen ID, 03 = e-Wallet

  if (cleaned.length === 10 && cleaned.startsWith("0")) {
    formattedTarget = "0066" + cleaned.substring(1);
    targetType = "01";
  } else if (cleaned.length === 13) {
    targetType = "02";
  } else if (cleaned.length === 15) {
    targetType = "03";
  }

  // Tag 29: Merchant Account Info for PromptPay
  const aid = formatTag("00", "A000000677010111");
  const targetTag = formatTag(targetType, formattedTarget);
  const tag29 = formatTag("29", aid + targetTag);

  // Base Payload
  let payload =
    formatTag("00", "01") + // Payload Format Indicator
    formatTag("01", amount && amount > 0 ? "12" : "11") + // 11 = Static, 12 = Dynamic
    tag29 +
    formatTag("53", "764") + // Transaction Currency: 764 = THB
    formatTag("58", "TH"); // Country Code: TH

  if (amount !== undefined && amount > 0) {
    payload += formatTag("54", amount.toFixed(2)); // Transaction Amount
  }

  // Tag 63: CRC Checksum placeholder
  const payloadWithTag63 = payload + "6304";
  const checksum = crc16(payloadWithTag63);

  return payloadWithTag63 + checksum;
}
