/**
 * ════════════════════════════════════════════════════════════════
 *  SNEAKER CARE — Google Apps Script Backend  (ฉบับเต็ม)
 *  วางโค้ดทั้งหมดนี้ใน Apps Script แล้ว Deploy เป็น Web App
 *
 *  Sheet ที่ต้องมี (สร้างล่วงหน้า):
 *    SC_Users    — ผู้ใช้งานระบบ
 *    SC_Sales    — ยอดขาย/บริการรายวัน
 *    SC_Expenses — รายจ่ายรายวัน + คลังสินค้า
 *    SC_Opex     — ค่าใช้จ่ายประจำเดือน
 *    SC_Payments — การรับชำระ AR
 *    SC_Stock_Status — สต๊อกวัสดุคงคลัง
 *    SC_Settings — ตั้งค่าร้าน
 *    SC_Employees— รายชื่อพนักงาน
 * ════════════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ─────────────────────────────────────────────
const TOKEN_EXPIRY_HOURS = 720; // 30 วัน

/**
 * 👉 ถ้ารัน Script แบบ Standalone (จาก script.google.com)
 *    ให้ใส่ ID ของ Google Sheet ที่นี่
 *    หา ID ได้จาก URL: docs.google.com/spreadsheets/d/ [ID อยู่ตรงนี้] /edit
 *
 *    ถ้าเปิด Script จาก Google Sheet (Extensions → Apps Script)
 *    ปล่อยว่างไว้ได้เลย ระบบจะหา Sheet ให้อัตโนมัติ
 */
const SPREADSHEET_ID = '1MFhGrlOrpguJzrXpzQT4H7T3-Wo4kMAWWisOFpMB_VE';

// ── HELPER: Get Spreadsheet (รองรับทั้ง Bound และ Standalone) ──
function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ไม่พบ Spreadsheet กรุณาใส่ SPREADSHEET_ID ในโค้ด หรือเปิด Script จากเมนู Extensions → Apps Script ใน Google Sheet');
  return ss;
}

// ── HELPER: JSON Response ──────────────────────────────────────
function res(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HELPER: Get Sheet (สร้างถ้ายังไม่มี) ─────────────────────
function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// ── HELPER: Convert sheet cell value (Date object OR string) → "DD/MM/YYYY" ──
// Google Sheets returns date-formatted cells as JS Date objects in GAS.
// This function normalises everything to DD/MM/YYYY (Gregorian) for comparison.
function sheetDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    // Use Utilities.formatDate to get the sheet's local timezone
    try {
      const tz = Session.getScriptTimeZone();
      return Utilities.formatDate(val, tz, 'dd/MM/yyyy');
    } catch(e) {
      // Fallback: use UTC date parts directly
      const d = String(val.getDate()).padStart(2, '0');
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const y = val.getFullYear();
      return d + '/' + m + '/' + y;
    }
  }
  return String(val).trim();
}

// ── HELPER: "DD/MM/YYYY" → "MM/YYYY" (for month matching) ──
function dateStrToMonth(val) {
  const s = sheetDateStr(val);
  if (!s) return '';
  if (s.indexOf('/') >= 0) {
    const p = s.split('/');
    if (p.length === 3) return p[1].padStart(2, '0') + '/' + p[2];
  }
  // Already ISO "YYYY-MM-DD"
  if (s.indexOf('-') >= 0) {
    const p = s.split('T')[0].split('-');
    if (p.length >= 2) return p[1].padStart(2, '0') + '/' + p[0];
  }
  return '';
}

// ── HELPER: Thai Date Conversion ──────────────────────────────
function thaiToIso(str) {
  // "28/05/2568" → "2025-05-28"  |  "28/05/2026" → "2026-05-28"
  const p = String(str || '').trim().split('/');
  if (p.length !== 3) return str;
  const year = parseInt(p[2]) > 2500 ? parseInt(p[2]) - 543 : parseInt(p[2]);
  return year + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
}

function isoToThai(str) {
  // "2026-05-28" → "28/05/2026" (Gregorian, no Buddhist conversion)
  const p = String(str || '').trim().split('-');
  if (p.length !== 3) return str;
  return p[2] + '/' + p[1] + '/' + p[0];
}

function datesMatch(a, b) {
  if (!a || !b) return false;
  // Normalize both to "YYYY-MM-DD" for a single reliable comparison
  function toIsoNorm(val) {
    const s = sheetDateStr(val);  // Date obj → "DD/MM/YYYY", string → unchanged
    // Already ISO "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    // "DD/MM/YYYY"
    const p = s.split('/');
    if (p.length === 3) {
      const y = parseInt(p[2]) > 2500 ? parseInt(p[2]) - 543 : parseInt(p[2]);
      return y + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
    }
    return s;
  }
  return toIsoNorm(a) === toIsoNorm(b);
}

// ── HELPER: Generate Token ─────────────────────────────────────
function generateToken() {
  return Utilities.getUuid().replace(/-/g, '');
}

// ── HELPER: SHA-256 hash password ─────────────────────────────
// SC_Users column layout (actual):
//   0=username, 1=passwordHash, 2=fullname, 3=nickname, 4=role, 5=token, 6=token_expiry
function hashPassword(pwd) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    pwd,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

// ── HELPER: Verify Token ───────────────────────────────────────
function verifyToken(token) {
  if (!token) return null;
  const sheet = getSheet('SC_Users');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // SC_Users: 0=username, 1=passwordHash, 2=fullname, 3=nickname, 4=role, 5=token, 6=token_expiry
    if (String(row[5]).trim() === String(token).trim()) {
      const expiry = new Date(row[6]);
      if (new Date() < expiry) {
        return {
          username:     row[0],
          role:         String(row[4]).trim() || 'staff',  // col 4 = Role
          display_name: String(row[3]).trim() || String(row[0]).trim(), // col 3 = Nickname
          full_name:    String(row[2]).trim(), // col 2 = Fullname
          rowIndex:     i + 1
        };
      }
    }
  }
  return null;
}

// ── HELPER: Settings ──────────────────────────────────────────
function getSettings() {
  const sheet = getSheet('SC_Settings');
  const data = sheet.getDataRange().getValues();
  const settings = {};
  data.forEach(row => {
    if (row[0]) settings[String(row[0]).trim()] = row[1];
  });
  return settings;
}

function setSetting(key, value) {
  const sheet = getSheet('SC_Settings');
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  // Not found → append
  sheet.appendRow([key, value]);
}

// ══════════════════════════════════════════════════════════════
//  doGet — ส่ง Master Data กลับไปยัง Dashboard
// ══════════════════════════════════════════════════════════════
function doGet(e) {
  const params = e.parameter || {};

  // ── Validate token session ──────────────────────────────────
  if (params.action === 'validate') {
    const user = verifyToken(params.token);
    if (user) {
      return res({ valid: true, role: user.role, display_name: user.display_name });
    }
    return res({ valid: false });
  }

  // ── getSale: ดึงยอดขายตามวันที่ (สำหรับ pre-fill ฟอร์มรายวัน) ──
  if (params.action === 'getSale') {
    const tokenUser = verifyToken(params.token);
    if (!tokenUser) return res({ status: 'error', message: 'unauthorized' });
    try {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName('SC_Sales');
      if (!sheet) return res({ found: false });
      const rows = sheet.getDataRange().getValues();
      const dateQ = String(params.date || '').trim();
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const rowDate = sheetDateStr(r[0]);
        if (rowDate === dateQ || datesMatch(r[0], dateQ)) {
          return res({
            found: true,
            date: r[0], bill_no: r[1], customer: r[2],
            size_s: Number(r[3]) || 0, size_m: Number(r[4]) || 0,
            size_l: Number(r[5]) || 0, size_xl: Number(r[6]) || 0,
            total_amount: Number(r[7]) || 0,
            transfer_amount: Number(r[8]) || 0,
            cash_amount: Number(r[9]) || 0,
            entered_by: r[10] || '',
            discount: Number(r[11]) || 0,
            gross_amount: Number(r[12]) || Number(r[7]) || 0,
            payment_status: r[13] || 'ชำระครบ',
            received_amount: Number(r[14]) || 0
          });
        }
      }
      return res({ found: false });
    } catch (err) {
      return res({ status: 'error', message: err.toString() });
    }
  }

  // ── Verify token for data load ──────────────────────────────
  const user = verifyToken(params.token);
  if (!user) {
    return res({ status: 'error', message: 'unauthorized' });
  }

  try {
    const ss = getSpreadsheet();

    // 1. Stock Status
    const stockSheet = ss.getSheetByName('SC_Stock_Status');
    const stockData = stockSheet ? stockSheet.getDataRange().getValues() : [[]];

    // 2. Settings — return as 2D array so dashboard populateBizProfile() can iterate rows
    const settingsSheet = ss.getSheetByName('SC_Settings');
    const settingsRaw = settingsSheet ? settingsSheet.getDataRange().getValues() : [];
    const settings = settingsRaw.filter(row => row[0] && String(row[0]).trim() !== 'key');

    // 3. Employees
    const empSheet = ss.getSheetByName('SC_Employees');
    const empData = empSheet ? empSheet.getDataRange().getValues() : [];
    const employees = empData.slice(1).map(row => ({
      name:       String(row[0] || '').trim(),
      salary:     Number(row[1]) || 0,
      bank:       String(row[2] || '').trim(),
      account:    String(row[3] || '').trim(),
      status:     String(row[4] || 'Active').trim(),
      comm_rate:  Number(row[5]) || 0,
      nickname:   String(row[6] || '').trim()
    })).filter(e => e.name);

    // หมายเหตุ: sales/expenses/opex/payments โหลดผ่าน list_monthly POST แยกต่างหาก
    // doGet ส่งเฉพาะ master data (stock, settings, employees) เพื่อความเร็ว
    return res({
      status: 'ok',
      stock: stockData,
      settings: settings,
      employees: employees
    });

  } catch (err) {
    return res({ status: 'error', message: err.toString() });
  }
}

// ══════════════════════════════════════════════════════════════
//  doPost — รับคำสั่งจาก Dashboard
// ══════════════════════════════════════════════════════════════
function doPost(e) {
  let data = {};
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return res({ status: 'error', message: 'Invalid JSON: ' + err.toString() });
  }

  const formType = data.formType || '';

  // ── LOGIN ──────────────────────────────────────────────────
  if (formType === 'login') {
    return handleLogin(data);
  }

  // ── LOGOUT ─────────────────────────────────────────────────
  if (formType === 'logout') {
    return handleLogout(data);
  }

  // ── CHANGE PASSWORD ────────────────────────────────────────
  if (formType === 'change_password') {
    return handleChangePassword(data);
  }

  // ── Verify token for all other operations ──────────────────
  const user = verifyToken(data.token);
  if (!user) {
    return res({ status: 'error', message: 'unauthorized' });
  }

  switch (formType) {
    case 'list_monthly':           return handleListMonthly(data, user);
    case 'sales_form':             return handleSalesForm(data, user);
    case 'save_opex':              return handleSaveOpex(data, user);
    case 'stock_transaction_form': return handleStockTransaction(data, user);
    case 'save_payment':           return handleSavePayment(data, user);
    case 'save_biz_info':          return handleSaveBizInfo(data, user);
    case 'save_emp_config':        return handleSaveEmpConfig(data, user);
    case 'delete_expense':         return handleDeleteExpense(data, user);
    case 'list_users':             return handleListUsers(data, user);
    case 'create_user':            return handleCreateUser(data, user);
    case 'update_user':            return handleUpdateUser(data, user);
    case 'delete_user':            return handleDeleteUser(data, user);
    default:
      return res({ status: 'error', message: 'Unknown formType: ' + formType });
  }
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: List Monthly Data
//
//  รับ months = ["05/2025", "06/2025", ...]
//  คืน sales, expenses, opex, payments ของช่วงเดือนนั้น
// ══════════════════════════════════════════════════════════════
function handleListMonthly(data, user) {
  try {
    const ss = getSpreadsheet();
    const months = (data.months || []).map(m => String(m).trim());

    // Serialize a row so Date objects become strings before JSON response
    function serializeRow(row) {
      return row.map(cell => {
        if (cell instanceof Date) {
          try {
            return Utilities.formatDate(cell, Session.getScriptTimeZone(), 'dd/MM/yyyy');
          } catch(e) {
            return sheetDateStr(cell);
          }
        }
        return cell;
      });
    }

    // SC_Sales — กรองตามเดือน
    const salesSheet = ss.getSheetByName('SC_Sales');
    const salesRaw = salesSheet ? salesSheet.getDataRange().getValues().slice(1).filter(r => r[0]) : [];
    const sales = (months.length
      ? salesRaw.filter(r => months.indexOf(dateStrToMonth(r[0])) >= 0)
      : salesRaw).map(serializeRow);

    // SC_Expenses — กรองตามเดือน (ข้อมูลใหม่ที่กรอกผ่าน Dashboard)
    const expSheet = ss.getSheetByName('SC_Expenses');
    const expRaw = expSheet ? expSheet.getDataRange().getValues().slice(1).filter(r => r[0]) : [];
    const expFiltered = months.length
      ? expRaw.filter(r => months.indexOf(dateStrToMonth(r[0])) >= 0)
      : expRaw;

    // SC_Stock_Transactions — sheet เก่าที่มีข้อมูลซื้อของ
    // Columns: date(ISO), type, item_name, qty, price_per_unit, total, pay_method, entered_by, lastUpdated
    // แปลงเป็นรูปแบบ SC_Expenses: date, category, item_name, total_amount, pay_method, qty, price_per_unit, unit, type
    const stSheet = ss.getSheetByName('SC_Stock_Transactions');
    const stRaw = stSheet ? stSheet.getDataRange().getValues().slice(1).filter(r => r[0]) : [];
    const stFiltered = (months.length
      ? stRaw.filter(r => months.indexOf(dateStrToMonth(r[0])) >= 0)
      : stRaw
    ).map(r => [
      sheetDateStr(r[0]),                                            // A: date → "DD/MM/YYYY"
      r[1] === 'ซื้อเข้า' ? 'ต้นทุนวัสดุคลัง' : 'เบิกใช้งาน',  // B: category
      r[2],                                                          // C: item_name
      r[5],                                                          // D: total_amount
      r[6],                                                          // E: pay_method
      r[3],                                                          // F: qty
      r[4],                                                          // G: price_per_unit
      '',                                                            // H: unit
      r[1]                                                           // I: type
    ]);

    // รวม SC_Expenses + SC_Stock_Transactions (ใหม่ก่อน เก่าต่อท้าย)
    const expenses = [...expFiltered.map(serializeRow), ...stFiltered];

    // SC_Opex — month column อาจเป็น Date object หรือ text "MM/YYYY" / "M/YYYY"
    // ใช้ dateStrToMonth() เพื่อรองรับทั้ง 2 รูปแบบ
    const opexSheet = ss.getSheetByName('SC_Opex');
    const opexRaw = opexSheet ? opexSheet.getDataRange().getValues().slice(1).filter(r => r[0]) : [];
    const opex = (months.length
      ? opexRaw.filter(r => {
          let mStr;
          if (r[0] instanceof Date) {
            // Date object → "MM/YYYY" ผ่าน dateStrToMonth
            mStr = dateStrToMonth(r[0]);
          } else {
            // text "6/2026" หรือ "06/2026"
            const m = String(r[0]).trim();
            const p = m.split('/');
            mStr = (p.length === 2) ? p[0].padStart(2, '0') + '/' + p[1] : m;
          }
          return months.indexOf(mStr) >= 0;
        })
      : opexRaw).map(serializeRow);

    // SC_Payments — กรองตาม sale_date เดือน
    const paySheet = ss.getSheetByName('SC_Payments');
    const payRaw = paySheet ? paySheet.getDataRange().getValues().slice(1).filter(r => r[0]) : [];
    const payments = (months.length
      ? payRaw.filter(r => months.indexOf(dateStrToMonth(r[0])) >= 0)
      : payRaw).map(serializeRow);

    // Debug info: ช่วยวิเคราะห์ว่าข้อมูลถูกกรองออกหรือเปล่า
    const debugInfo = {
      months_requested: months,
      exp_total_rows: expRaw.length,
      exp_first_date: expRaw.length > 0 ? String(expRaw[0][0]) : 'ว่าง',
      exp_first_month: expRaw.length > 0 ? dateStrToMonth(expRaw[0][0]) : 'ว่าง',
      opex_total_rows: opexRaw.length,
      opex_first_month: opexRaw.length > 0 ? String(opexRaw[0][0]) : 'ว่าง',
      sales_filtered: sales.length,
      exp_filtered: expenses.length,
      opex_filtered: opex.length
    };

    return res({ status: 'ok', sales: sales, expenses: expenses, opex: opex, payments: payments, _debug: debugInfo });

  } catch (err) {
    return res({ status: 'error', message: 'list_monthly error: ' + err.toString() });
  }
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Login
// ══════════════════════════════════════════════════════════════
function handleLogin(data) {
  const { username, password } = data;
  if (!username || !password) {
    return res({ status: 'error', message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const sheet = getSheet('SC_Users');
  const rows = sheet.getDataRange().getValues();

  // SC_Users: 0=username, 1=passwordHash, 2=fullname, 3=nickname, 4=role, 5=token, 6=token_expiry
  const inputHash = hashPassword(String(password).trim());

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const uname  = String(row[0]).trim();
    const stored = String(row[1]).trim();
    const fname  = String(row[2]).trim() || '';   // col 2 = Fullname
    const dname  = String(row[3]).trim() || uname; // col 3 = Nickname
    const role   = String(row[4]).trim() || 'staff'; // col 4 = Role

    if (uname !== username.trim()) continue;

    // Support both hashed (64-char hex) and legacy plaintext passwords
    const isHashed = /^[a-f0-9]{64}$/i.test(stored);
    const pwdMatch = isHashed
      ? (inputHash === stored)
      : (String(password).trim() === stored);

    if (pwdMatch) {
      // Auto-upgrade plaintext passwords to SHA-256 hash
      if (!isHashed) {
        sheet.getRange(i + 1, 2).setValue(inputHash);
      }
      const token = generateToken();
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + TOKEN_EXPIRY_HOURS);
      sheet.getRange(i + 1, 6).setValue(token);
      sheet.getRange(i + 1, 7).setValue(expiry.toISOString());
      return res({
        status:       'ok',
        token:        token,
        role:         role,
        display_name: dname,
        full_name:    fname,
        username:     uname
      });
    }
  }

  return res({ status: 'error', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Logout
// ══════════════════════════════════════════════════════════════
function handleLogout(data) {
  const sheet = getSheet('SC_Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][5]).trim() === String(data.token).trim()) {
      sheet.getRange(i + 1, 6).setValue('');
      sheet.getRange(i + 1, 7).setValue('');
      break;
    }
  }
  return res({ status: 'ok' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Change Password
// ══════════════════════════════════════════════════════════════
function handleChangePassword(data) {
  const user = verifyToken(data.token);
  if (!user) return res({ status: 'error', message: 'unauthorized' });

  const target = data.target_user || user.username;
  // Only admin can change others' passwords
  if (target !== user.username && user.role !== 'admin') {
    return res({ status: 'error', message: 'ไม่มีสิทธิ์เปลี่ยนรหัสผ่านผู้อื่น' });
  }

  if (!data.new_password || String(data.new_password).trim().length < 6) {
    return res({ status: 'error', message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }
  const sheet = getSheet('SC_Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === target) {
      sheet.getRange(i + 1, 2).setValue(hashPassword(String(data.new_password).trim()));
      return res({ status: 'ok', message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
    }
  }
  return res({ status: 'error', message: 'ไม่พบผู้ใช้' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: List Users (admin only)
// ══════════════════════════════════════════════════════════════
function handleListUsers(data, user) {
  if (user.role !== 'admin') {
    return res({ status: 'error', message: 'ไม่มีสิทธิ์ดูรายชื่อผู้ใช้' });
  }
  const sheet = getSheet('SC_Users');
  const rows = sheet.getDataRange().getValues();
  // SC_Users: 0=username, 1=passwordHash, 2=fullname, 3=nickname, 4=role
  const users = rows.slice(1).filter(r => String(r[0]).trim()).map(function(r) {
    return {
      username: String(r[0]).trim(),
      fullname: String(r[2]).trim(),
      nickname: String(r[3]).trim(),
      role:     String(r[4]).trim() || 'manager'
    };
  });
  return res({ status: 'ok', users: users });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Create User (admin only)
// ══════════════════════════════════════════════════════════════
function handleCreateUser(data, user) {
  if (user.role !== 'admin') {
    return res({ status: 'error', message: 'ไม่มีสิทธิ์สร้างผู้ใช้ใหม่' });
  }
  const username  = String(data.username  || '').trim();
  const password  = String(data.password  || '').trim();
  const full_name = String(data.full_name || '').trim();
  const nickname  = String(data.nickname  || username).trim();
  const role      = String(data.role      || 'manager').trim();

  if (!username || !password || !full_name) {
    return res({ status: 'error', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  if (password.length < 6) {
    return res({ status: 'error', message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }
  if (!['admin', 'co-admin', 'manager'].includes(role)) {
    return res({ status: 'error', message: 'สิทธิ์ไม่ถูกต้อง' });
  }

  const sheet = getSheet('SC_Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === username.toLowerCase()) {
      return res({ status: 'error', message: 'Username "' + username + '" มีอยู่แล้ว' });
    }
  }

  // Append: 0=username, 1=passwordHash, 2=fullname, 3=nickname, 4=role, 5=token, 6=token_expiry
  sheet.appendRow([username, hashPassword(password), full_name, nickname, role, '', '']);
  return res({ status: 'ok', message: 'สร้างผู้ใช้สำเร็จ' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Update User (admin only)
// ══════════════════════════════════════════════════════════════
function handleUpdateUser(data, user) {
  if (user.role !== 'admin') {
    return res({ status: 'error', message: 'ไม่มีสิทธิ์แก้ไขข้อมูลผู้ใช้' });
  }
  const target = String(data.username || '').trim();
  if (!target) return res({ status: 'error', message: 'ไม่ระบุ username' });

  const role = String(data.role || '').trim().toLowerCase();
  if (role && !['admin', 'co-admin', 'manager'].includes(role)) {
    return res({ status: 'error', message: 'สิทธิ์ไม่ถูกต้อง' });
  }

  const sheet = getSheet('SC_Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === target) {
      if (data.full_name !== undefined) sheet.getRange(i + 1, 3).setValue(String(data.full_name).trim());
      if (data.nickname  !== undefined) sheet.getRange(i + 1, 4).setValue(String(data.nickname).trim());
      if (role)                         sheet.getRange(i + 1, 5).setValue(role);
      return res({ status: 'ok', message: 'อัปเดตข้อมูลสำเร็จ' });
    }
  }
  return res({ status: 'error', message: 'ไม่พบผู้ใช้' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Delete User (admin only, cannot self-delete)
// ══════════════════════════════════════════════════════════════
function handleDeleteUser(data, user) {
  if (user.role !== 'admin') {
    return res({ status: 'error', message: 'ไม่มีสิทธิ์ลบผู้ใช้' });
  }
  const target = String(data.username || '').trim();
  if (!target) return res({ status: 'error', message: 'ไม่ระบุ username' });
  if (target === user.username) {
    return res({ status: 'error', message: 'ไม่สามารถลบบัญชีของตัวเองได้' });
  }

  const sheet = getSheet('SC_Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === target) {
      sheet.deleteRow(i + 1);
      return res({ status: 'ok', message: 'ลบผู้ใช้สำเร็จ' });
    }
  }
  return res({ status: 'error', message: 'ไม่พบผู้ใช้' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Save Sales (ยอดขายรายวัน)
//
//  SC_Sales columns:
//  A=date  B=bill_no  C=customer  D=size_s  E=size_m  F=size_l  G=size_xl
//  H=total_amount  I=transfer_amount  J=cash_amount  K=entered_by
//  L=discount  M=gross_amount  N=payment_status  O=received_amount
// ══════════════════════════════════════════════════════════════
function handleSalesForm(data, user) {
  const sheet = getSheet('SC_Sales');

  // ตรวจสอบว่ามีข้อมูลวันนี้แล้วหรือยัง
  const lastRow = sheet.getLastRow();
  let targetRow = -1;

  if (data.overwrite && lastRow >= 2) {
    const dateCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < dateCol.length; i++) {
      if (datesMatch(dateCol[i][0], data.date)) {
        targetRow = i + 2;
        break;
      }
    }
  }

  const rowData = [
    data.date,
    data.bill_no || '',
    data.customer || 'ยอดรวมประจำวัน',
    Number(data.size_s) || 0,
    Number(data.size_m) || 0,
    Number(data.size_l) || 0,
    Number(data.size_xl) || 0,
    Number(data.total_amount) || 0,
    Number(data.pay_method) || 0,    // transfer_amount
    Number(data.employee) || 0,      // cash_amount
    data.entered_by || user.display_name,
    Number(data.discount) || 0,
    Number(data.gross_amount) || Number(data.total_amount) || 0,
    data.payment_status || 'ชำระครบ',
    Number(data.received_amount) || 0
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return res({ status: 'success', message: 'บันทึกยอดขายสำเร็จ' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Save Opex (ค่าใช้จ่ายประจำเดือน)
//
//  SC_Opex columns:
//  A=month  B=category  C=key  D=name  E=amount  F=method
// ══════════════════════════════════════════════════════════════
function handleSaveOpex(data, user) {
  const sheet = getSheet('SC_Opex');
  const month = data.month;

  if (!month) return res({ status: 'error', message: 'ไม่ระบุเดือน' });

  // ลบข้อมูลเดือนนั้นออกก่อน (overwrite)
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const monthCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const rowsToDelete = [];
    for (let i = monthCol.length - 1; i >= 0; i--) {
      if (String(monthCol[i][0]).trim() === month) {
        rowsToDelete.push(i + 2);
      }
    }
    rowsToDelete.forEach(r => sheet.deleteRow(r));
  }

  // เพิ่มรายการใหม่
  const items = data.items || [];
  items.forEach(item => {
    sheet.appendRow([
      month,
      item.category || '',
      item.key || '',
      item.name || '',
      Number(item.amount) || 0,
      item.method || ''
    ]);
  });

  return res({ status: 'success', message: 'บันทึกค่าใช้จ่ายประจำเดือน ' + month + ' สำเร็จ' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Stock Transaction (ซื้อเข้า / เบิกออก)
//
//  SC_Expenses columns:
//  A=date  B=category  C=item_name  D=total_amount  E=pay_method
//  F=qty   G=price_per_unit  H=unit  I=type
//
//  SC_Stock columns:
//  A=name  B=category  C=unit  D=qty  E=last_price  F=min_alert
// ══════════════════════════════════════════════════════════════
function handleStockTransaction(data, user) {
  const expSheet = getSheet('SC_Expenses');
  const stockSheet = getSheet('SC_Stock_Status');

  const isInflow = data.type === 'ซื้อเข้า';
  const qty = Number(data.qty) || 0;
  const pricePerUnit = Number(data.price_per_unit) || 0;
  const totalAmt = Number(data.total_amount) || 0;

  // 1. บันทึกธุรกรรมใน SC_Expenses
  expSheet.appendRow([
    data.date,
    isInflow ? 'ต้นทุนวัสดุคลัง' : 'เบิกใช้งาน',
    data.item_name,
    isInflow ? totalAmt : 0,
    data.pay_method || '',
    qty,
    pricePerUnit,
    data.unit || 'ชิ้น',
    data.type
  ]);

  // 2. อัปเดต SC_Stock
  const stockData = stockSheet.getDataRange().getValues();
  let stockRowIdx = -1;

  for (let i = 1; i < stockData.length; i++) {
    if (String(stockData[i][0]).trim() === String(data.item_name).trim()) {
      stockRowIdx = i + 1;
      break;
    }
  }

  if (stockRowIdx > 0) {
    // อัปเดตแถวที่มีอยู่
    const currentQty = Number(stockSheet.getRange(stockRowIdx, 4).getValue()) || 0;
    const newQty = isInflow ? currentQty + qty : Math.max(0, currentQty - qty);
    stockSheet.getRange(stockRowIdx, 4).setValue(newQty);
    if (isInflow && pricePerUnit > 0) {
      stockSheet.getRange(stockRowIdx, 5).setValue(pricePerUnit);
    }
    if (isInflow && data.category) {
      stockSheet.getRange(stockRowIdx, 2).setValue(data.category);
    }
    if (isInflow && data.unit) {
      stockSheet.getRange(stockRowIdx, 3).setValue(data.unit);
    }
  } else if (isInflow) {
    // เพิ่มรายการใหม่ใน SC_Stock
    const minAlert = 10; // ค่า default
    stockSheet.appendRow([
      data.item_name,
      data.category || 'ทั่วไป',
      data.unit || 'ชิ้น',
      qty,
      pricePerUnit,
      minAlert
    ]);
  }

  return res({ status: 'success', message: 'บันทึก ' + data.type + ' สำเร็จ' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Save Payment (รับชำระ AR)
//
//  SC_Payments columns:
//  A=sale_date  B=received_date  C=amount  D=method  E=received_by
// ══════════════════════════════════════════════════════════════
function handleSavePayment(data, user) {
  const sheet = getSheet('SC_Payments');

  // ตรวจซ้ำ (ป้องกัน double submit)
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (
        datesMatch(r[0], data.sale_date) &&
        datesMatch(r[1], data.received_date) &&
        Math.abs(Number(r[2]) - Number(data.amount)) < 0.01 &&
        String(r[3]).trim() === String(data.method || '').trim()
      ) {
        return res({ status: 'success', message: 'รายการนี้บันทึกไปแล้ว (ซ้ำ)' });
      }
    }
  }

  sheet.appendRow([
    data.sale_date,
    data.received_date,
    Number(data.amount) || 0,
    data.method || '',
    data.received_by || user.display_name
  ]);

  // อัปเดต payment_status ใน SC_Sales ถ้ามี
  if (data.update_sales_status) {
    const salesSheet = getSheet('SC_Sales');
    const salesData = salesSheet.getDataRange().getValues();
    for (let i = 1; i < salesData.length; i++) {
      if (datesMatch(salesData[i][0], data.sale_date)) {
        // col N (index 13) = payment_status, col O (index 14) = received_amount
        salesSheet.getRange(i + 1, 14).setValue(data.new_status || 'ชำระบางส่วน');
        if (data.new_received_amount !== undefined) {
          salesSheet.getRange(i + 1, 15).setValue(Number(data.new_received_amount));
        }
        break;
      }
    }
  }

  return res({ status: 'success', message: 'บันทึกการรับชำระสำเร็จ' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Save Business Info / Settings
//
//  SC_Settings columns: A=key  B=value
// ══════════════════════════════════════════════════════════════
function handleSaveBizInfo(data, user) {
  const settings = data.settings || {};
  Object.keys(settings).forEach(key => {
    setSetting(key, settings[key]);
  });
  return res({ status: 'success', message: 'บันทึกการตั้งค่าสำเร็จ' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Save Employee Config
//
//  SC_Employees columns:
//  A=name  B=salary  C=bank  D=account  E=status  F=comm_rate  G=nickname
// ══════════════════════════════════════════════════════════════
function handleSaveEmpConfig(data, user) {
  if (user.role !== 'admin' && user.role !== 'co-admin') {
    return res({ status: 'error', message: 'ไม่มีสิทธิ์แก้ไขข้อมูลพนักงาน' });
  }

  const sheet = getSheet('SC_Employees');
  const employees = data.employees || [];

  // เคลียร์และเขียนใหม่ (เก็บ header row)
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }

  // สร้าง header ถ้ายังไม่มี
  if (lastRow < 1) {
    sheet.appendRow(['ชื่อ', 'เงินเดือน', 'ธนาคาร', 'เลขบัญชี', 'สถานะ', 'คอม%', 'ชื่อเล่น']);
  }

  employees.forEach((emp, i) => {
    sheet.getRange(i + 2, 1, 1, 7).setValues([[
      emp.name || '',
      Number(emp.salary) || 0,
      emp.bank || '',
      emp.account || '',
      emp.status || 'Active',
      Number(emp.comm_rate) || 0,
      emp.nickname || ''
    ]]);
  });

  return res({ status: 'success', message: 'บันทึกข้อมูลพนักงานสำเร็จ' });
}

// ══════════════════════════════════════════════════════════════
//  HANDLER: Delete Expense Row (ลบรายการซื้อของเข้าคลัง)
// ══════════════════════════════════════════════════════════════
function handleDeleteExpense(data, user) {
  const targetDate     = String(data.date || '').trim();
  const targetCategory = String(data.category || '').trim();
  const targetName     = String(data.item_name || '').trim();
  const targetAmt      = Number(data.total_amount) || 0;
  const targetPay      = String(data.pay_method || '').trim();
  const deletedQty     = Number(data.qty) || 0;

  // 1. ลองลบจาก SC_Expenses ก่อน (ข้อมูลใหม่)
  const expSheet = getSheet('SC_Expenses');
  const expData = expSheet.getLastRow() >= 2 ? expSheet.getDataRange().getValues() : [];
  let deletedRow = -1;

  for (let i = expData.length - 1; i >= 1; i--) {
    const row = expData[i];
    const dateOk = datesMatch(row[0], targetDate);
    const nameOk = String(row[2] || '').trim() === targetName;
    const amtOk  = Math.abs((Number(row[3]) || 0) - targetAmt) < 0.01;
    const payOk  = String(row[4] || '').trim() === targetPay;
    if (dateOk && nameOk && amtOk && payOk) {
      expSheet.deleteRow(i + 1);
      deletedRow = i + 1;
      break;
    }
  }

  // 2. ถ้าไม่เจอใน SC_Expenses ให้ลองลบจาก SC_Stock_Transactions (ข้อมูลเก่า)
  if (deletedRow === -1) {
    const stSheet = getSheet('SC_Stock_Transactions');
    const stData = stSheet.getLastRow() >= 2 ? stSheet.getDataRange().getValues() : [];
    // SC_Stock_Transactions columns: date, type, item_name, qty, price_per_unit, total, pay_method, ...
    for (let i = stData.length - 1; i >= 1; i--) {
      const row = stData[i];
      const dateOk = datesMatch(row[0], targetDate);
      const nameOk = String(row[2] || '').trim() === targetName;
      const amtOk  = Math.abs((Number(row[5]) || 0) - targetAmt) < 0.01;
      const payOk  = !targetPay || String(row[6] || '').trim() === targetPay;
      if (dateOk && nameOk && amtOk && payOk) {
        stSheet.deleteRow(i + 1);
        deletedRow = i + 1;
        break;
      }
    }
  }

  if (deletedRow === -1) {
    return res({ status: 'error', message: 'ไม่พบรายการที่ต้องการลบใน SC_Expenses หรือ SC_Stock_Transactions' });
  }

  // 3. อัปเดต SC_Stock_Status — ถ้าเป็นรายการซื้อเข้า ให้ลดจำนวนคืน
  if ((targetCategory === 'ต้นทุนวัสดุคลัง' || targetCategory === 'ซื้อเข้า') && deletedQty > 0) {
    const stockSheet = getSheet('SC_Stock_Status');
    const stockData = stockSheet.getDataRange().getValues();
    for (let i = 1; i < stockData.length; i++) {
      if (String(stockData[i][0]).trim() === targetName) {
        const currentQty = Number(stockData[i][3]) || 0;
        stockSheet.getRange(i + 1, 4).setValue(Math.max(0, currentQty - deletedQty));
        break;
      }
    }
  }

  return res({ status: 'success', message: 'ลบแถว ' + deletedRow + ' สำเร็จ' });
}

// ══════════════════════════════════════════════════════════════
//  (Optional) UPDATE MIN ALERT — เรียกจาก save_biz_info แล้ว
//  แต่ถ้าต้องการ handler แยกต่างหาก ใช้ฟังก์ชันนี้
// ══════════════════════════════════════════════════════════════
function updateStockMinAlert(itemName, newVal) {
  const sheet = getSheet('SC_Stock_Status');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === itemName) {
      sheet.getRange(i + 1, 6).setValue(Number(newVal));
      return true;
    }
  }
  return false;
}

// ══════════════════════════════════════════════════════════════
//  DIAGNOSTIC — รันจาก Apps Script Editor เพื่อตรวจสอบปัญหา
//  คลิก Run → debugSetup()
// ══════════════════════════════════════════════════════════════
function debugSetup() {
  const ss = getSpreadsheet();
  const sheets = ss.getSheets().map(s => s.getName());
  Logger.log('📋 Sheets ที่มีอยู่: ' + sheets.join(', '));

  const required = ['SC_Users', 'SC_Sales', 'SC_Expenses', 'SC_Opex',
                    'SC_Payments', 'SC_Stock_Status', 'SC_Settings', 'SC_Employees'];
  required.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) {
      Logger.log('❌ ไม่พบ: ' + name);
    } else {
      Logger.log('✅ ' + name + ' → ' + sh.getLastRow() + ' แถว');
    }
  });

  // แสดง SC_Users content
  const userSh = ss.getSheetByName('SC_Users');
  if (userSh) {
    const rows = userSh.getDataRange().getValues();
    Logger.log('--- SC_Users (' + rows.length + ' แถว) ---');
    rows.forEach((r, i) => Logger.log('Row ' + i + ': ' + JSON.stringify(r)));
  }

  // ตรวจ SC_Sales — แสดงตัวอย่าง 3 แถวแรก + ประเภทของ date cell
  const salesSh = ss.getSheetByName('SC_Sales');
  if (salesSh && salesSh.getLastRow() >= 2) {
    const sRows = salesSh.getDataRange().getValues().slice(1, 4);
    Logger.log('--- SC_Sales ตัวอย่าง ---');
    sRows.forEach((r, i) => {
      Logger.log('Row ' + (i+1) + ' date type=' + (r[0] instanceof Date ? 'Date' : typeof r[0]) +
        ' value=' + sheetDateStr(r[0]) + ' month=' + dateStrToMonth(r[0]));
    });
  } else {
    Logger.log('⚠️ SC_Sales ว่างเปล่า (ไม่มีข้อมูลยอดขาย)');
  }

  const opexSh = ss.getSheetByName('SC_Opex');
  Logger.log('SC_Opex แถว: ' + (opexSh ? opexSh.getLastRow() : 'ไม่มีชีต'));

  // แสดงตัวอย่าง SC_Opex 5 แถวแรก เพื่อดู format ของ month column
  if (opexSh && opexSh.getLastRow() >= 2) {
    const opexRows = opexSh.getDataRange().getValues().slice(1, 6);
    Logger.log('--- SC_Opex ตัวอย่าง 5 แถวแรก ---');
    opexRows.forEach((r, i) => {
      Logger.log('Row ' + (i+1) + ': month=[' + String(r[0]) + '] category=[' + String(r[1]) + '] key=[' + String(r[2]) + '] amount=' + r[4]);
    });
  }

  // แสดงตัวอย่าง SC_Expenses
  const expSh = ss.getSheetByName('SC_Expenses');
  Logger.log('SC_Expenses แถว: ' + (expSh ? expSh.getLastRow() : 'ไม่มีชีต'));
  if (expSh && expSh.getLastRow() >= 2) {
    const expRows = expSh.getDataRange().getValues().slice(1, 4);
    Logger.log('--- SC_Expenses ตัวอย่าง ---');
    expRows.forEach((r, i) => {
      Logger.log('Row ' + (i+1) + ': date=[' + String(r[0]) + '] category=[' + r[1] + '] amount=' + r[3]);
    });
  } else {
    Logger.log('⚠️ SC_Expenses ว่างเปล่า — ยังไม่มีข้อมูลรายจ่าย');
  }

  // แสดงตัวอย่าง SC_Stock_Transactions (sheet เก่า)
  const stSh = ss.getSheetByName('SC_Stock_Transactions');
  Logger.log('SC_Stock_Transactions แถว: ' + (stSh ? stSh.getLastRow() : 'ไม่มีชีต'));
  if (stSh && stSh.getLastRow() >= 1) {
    const stRows = stSh.getDataRange().getValues().slice(0, 6); // header + 5 rows
    Logger.log('--- SC_Stock_Transactions ตัวอย่าง ---');
    stRows.forEach((r, i) => Logger.log('Row ' + i + ': ' + JSON.stringify(r)));
  }

  const empSh = ss.getSheetByName('SC_Employees');
  Logger.log('SC_Employees แถว: ' + (empSh ? empSh.getLastRow() : 'ไม่มีชีต'));
}

// ══════════════════════════════════════════════════════════════
//  FORCE RESET ADMIN — รันถ้าเข้าระบบไม่ได้
//  คลิก Run → forceResetAdmin()
//  จะเพิ่ม admin row ใหม่ (username: admin, password: admin1234)
// ══════════════════════════════════════════════════════════════
function forceResetAdmin() {
  const ss = getSpreadsheet();
  let userSh = ss.getSheetByName('SC_Users');
  if (!userSh) {
    userSh = ss.insertSheet('SC_Users');
    userSh.appendRow(['username', 'password', 'role', 'display_name', 'full_name', 'token', 'token_expiry']);
    Logger.log('สร้าง SC_Users ใหม่');
  }

  // ลบ admin row เดิมถ้ามี (ค้นหาจาก username = admin)
  const rows = userSh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]).trim().toLowerCase() === 'admin') {
      userSh.deleteRow(i + 1);
      Logger.log('ลบ admin row เดิมที่ row ' + (i + 1));
    }
  }

  // เพิ่ม admin user ใหม่
  userSh.appendRow(['admin', 'admin1234', 'admin', 'ผู้ดูแลระบบ', '', '', '']);
  Logger.log('✅ Reset admin สำเร็จ! Username: admin | Password: admin1234');
  Logger.log('⚠️ กรุณาเปลี่ยนรหัสผ่านหลัง Login');
}

// ══════════════════════════════════════════════════════════════
//  SETUP — รันครั้งแรกเพื่อสร้าง sheet และ user admin เริ่มต้น
//  คลิก Run → setupInitial() ใน Apps Script Editor
// ══════════════════════════════════════════════════════════════
function setupInitial() {
  const ss = getSpreadsheet();

  // สร้าง sheet ทั้งหมด
  const sheetDefs = {
    'SC_Users':     ['username', 'password', 'role', 'display_name', 'full_name', 'token', 'token_expiry'],
    'SC_Sales':     ['date', 'bill_no', 'customer', 'size_s', 'size_m', 'size_l', 'size_xl', 'total_amount', 'transfer_amount', 'cash_amount', 'entered_by', 'discount', 'gross_amount', 'payment_status', 'received_amount'],
    'SC_Expenses':  ['date', 'category', 'item_name', 'total_amount', 'pay_method', 'qty', 'price_per_unit', 'unit', 'type'],
    'SC_Opex':      ['month', 'category', 'key', 'name', 'amount', 'method'],
    'SC_Payments':  ['sale_date', 'received_date', 'amount', 'method', 'received_by'],
    'SC_Stock_Status':     ['name', 'category', 'unit', 'qty', 'last_price', 'min_alert'],
    'SC_Settings':  ['key', 'value'],
    'SC_Employees': ['name', 'salary', 'bank', 'account', 'status', 'comm_rate', 'nickname']
  };

  Object.entries(sheetDefs).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    // เพิ่ม header ถ้ายังไม่มี
    if (sheet.getLastRow() < 1) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#0d9488')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
    }
  });

  // สร้าง admin user ถ้ายังไม่มี
  const userSheet = ss.getSheetByName('SC_Users');
  if (userSheet.getLastRow() < 2) {
    userSheet.appendRow(['admin', 'admin1234', 'admin', 'ผู้ดูแลระบบ', '', '', '']);
    Logger.log('✅ Setup สำเร็จ! สร้าง admin user แล้ว | Username: admin | Password: admin1234 | กรุณาเปลี่ยนรหัสผ่านทันทีหลัง Login');
  } else {
    Logger.log('✅ Setup สำเร็จ! Sheet ทั้งหมดพร้อมใช้งานแล้ว');
  }
  Logger.log('Sheet ที่สร้าง: SC_Users, SC_Sales, SC_Expenses, SC_Opex, SC_Payments, SC_Stock_Status, SC_Settings, SC_Employees');
}
