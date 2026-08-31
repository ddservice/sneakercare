/**
 * Convert number to Thai Baht Text string (e.g. 12575 -> หนึ่งหมื่นสองพันห้าร้อยเจ็ดสิบห้าบาทถ้วน)
 */
export function thaiBahtText(num: number): string {
  if (num === 0) return "ศูนย์บาทถ้วน";
  if (!num || isNaN(num)) return "ศูนย์บาทถ้วน";

  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const [integerPart, decimalPart] = absNum.toFixed(2).split(".");

  const thaiNumbers = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const thaiUnits = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

  function convertGroup(nStr: string): string {
    let result = "";
    const len = nStr.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(nStr[i]);
      const unitPos = len - i - 1;
      if (digit !== 0) {
        if (unitPos === 0 && digit === 1 && len > 1 && parseInt(nStr[len - 2]) !== 0) {
          result += "เอ็ด";
        } else if (unitPos === 1 && digit === 2) {
          result += "ยี่สิบ";
        } else if (unitPos === 1 && digit === 1) {
          result += "สิบ";
        } else {
          result += thaiNumbers[digit] + thaiUnits[unitPos];
        }
      }
    }
    return result;
  }

  let text = "";
  let intStr = integerPart;
  if (intStr.length > 6) {
    const millionPart = intStr.slice(0, intStr.length - 6);
    intStr = intStr.slice(intStr.length - 6);
    text += convertGroup(millionPart) + "ล้าน";
  }
  text += convertGroup(intStr) + "บาท";

  const decNum = parseInt(decimalPart);
  if (decNum === 0) {
    text += "ถ้วน";
  } else {
    text += convertGroup(decimalPart) + "สตางค์";
  }

  return isNegative ? `ลบ${text}` : text;
}
