/**
 * Thai Baht Text Conversion Utility
 * Converts numeric amounts into formal Thai currency text
 */

const THAI_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const THAI_UNITS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function convertIntegerPart(numStr: string): string {
  let result = "";
  const len = numStr.length;

  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr.charAt(i), 10);
    const unitPos = len - i - 1;

    if (digit !== 0) {
      if (unitPos === 1 && digit === 1) {
        result += "สิบ";
      } else if (unitPos === 1 && digit === 2) {
        result += "ยี่สิบ";
      } else if (unitPos === 0 && digit === 1 && len > 1 && numStr.charAt(len - 2) !== "0") {
        result += "เอ็ด";
      } else {
        result += THAI_DIGITS[digit] + THAI_UNITS[unitPos];
      }
    }
  }

  return result || "ศูนย์";
}

export function thaiBahtText(amount: number): string {
  if (isNaN(amount) || amount === 0) return "ศูนย์บาทถ้วน";

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  const parts = absAmount.toFixed(2).split(".");
  const intPart = parts[0];
  const decPart = parts[1];

  let text = "";

  // Millions handling if > 1,000,000
  if (intPart.length > 6) {
    const millions = intPart.substring(0, intPart.length - 6);
    const remainder = intPart.substring(intPart.length - 6);
    text = convertIntegerPart(millions) + "ล้าน" + convertIntegerPart(remainder);
  } else {
    text = convertIntegerPart(intPart);
  }

  text += "บาท";

  if (decPart === "00") {
    text += "ถ้วน";
  } else {
    text += convertIntegerPart(decPart) + "สตางค์";
  }

  return (isNegative ? "ลบ" : "") + text;
}
