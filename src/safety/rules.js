// SafeChat AI — deterministic scam-detection rule engine.
// Pure JS: runs in the browser, in tests, and can be reused server-side.
// Rules are weighted; a message's risk is the sum of matched rule weights,
// capped and normalized. Conversation-level scoring aggregates evidence.

export const SCAM_CATEGORIES = {
  OTP_FRAUD: 'OTP / PIN harvesting',
  BANK_IMPERSONATION: 'Bank impersonation',
  UPI_FRAUD: 'UPI / payment fraud',
  COLLECT_REQUEST: 'UPI collect-request fraud',
  QR_FRAUD: 'QR-code payment fraud',
  REFUND_SCAM: 'Refund / callback scam',
  INVESTMENT_SCAM: 'Investment / crypto scam',
  LOAN_SCAM: 'Loan / advance-fee scam',
  JOB_SCAM: 'Employment scam',
  EDUCATION_SCAM: 'Education / scholarship scam',
  PHISHING: 'Phishing / malicious link',
  KYC_SCAM: 'KYC / Aadhaar / PAN scam',
  GOV_IMPERSONATION: 'Government / police impersonation',
  COURIER_SCAM: 'Fake courier / parcel scam',
  PRIZE_SCAM: 'Lottery / prize / giveaway scam',
  ROMANCE_SCAM: 'Romance / sextortion scam',
  TECH_SUPPORT: 'Tech-support / remote-access scam',
  ACCOUNT_RECOVERY: 'Account recovery scam',
  DONATION_SCAM: 'Fake donation scam',
  BLACKMAIL: 'Blackmail / threat scam',
  SOCIAL_ENGINEERING: 'Social engineering / urgency',
  DATA_THEFT: 'Personal data harvesting',
  MALWARE: 'Malicious attachment / app',
}

export const VERDICTS = {
  SAFE: 'SAFE',
  POTENTIAL_SCAM: 'POTENTIAL SCAM',
  HIGH_RISK: 'HIGH RISK',
  CRITICAL_RISK: 'CRITICAL RISK',
  INSUFFICIENT_INFO: 'INSUFFICIENT INFORMATION',
}

// Each rule: { id, category, patterns: [RegExp], weight (0-100),
//              requiresContext?, note, severity: 'low'|'medium'|'high'|'critical' }
// Patterns are tested case-insensitively. Weight contributes to message risk.
export const RULES = [
  // ---- OTP / PIN / CVV harvesting ----
  { id: 'otp_request', category: 'OTP_FRAUD', weight: 55, severity: 'high',
    note: 'Requests an OTP',
    patterns: [
      /\b(otp|one[- ]time (password|passcode|pin))\b[^.\n]{0,60}\b(share|send|give|tell|forward|provide|enter|batao|bhejo|share\s+karo)/i,
      /\b(share|send|give|tell|forward|provide|enter|batao|bhejo)\b[^.\n]{0,60}\b(otp|one[- ]time)/i,
      /\botp\s*(?:is|=|:|-)?\s*\d{4,8}\b/i,
      /\b(share|send|forward)\s+(the\s+)?otp\b/i,
    ] },
  { id: 'pin_cvv_request', category: 'OTP_FRAUD', weight: 60, severity: 'high',
    note: 'Requests card PIN / CVV',
    patterns: [
      /\b(cvv|cvc|card\s*(verification\s*)?(value|code)|atm\s*pin|upi\s*pin|pin\s*code)\b[^.\n]{0,60}\b(share|send|give|tell|enter|batao|bhejo)/i,
      /\b(share|send|give|tell|enter|batao|bhejo)\b[^.\n]{0,60}\b(cvv|cvc|atm\s*pin|upi\s*pin|card\s*pin)/i,
    ] },
  { id: 'password_request', category: 'DATA_THEFT', weight: 45, severity: 'high',
    note: 'Requests password/credentials',
    patterns: [
      /\b(password|passcode|login\s*(id|details)|credentials|user\s*id\s*and\s*password)\b[^.\n]{0,60}\b(share|send|give|tell|enter|batao|bhejo)/i,
    ] },

  // ---- UPI / payment fraud ----
  { id: 'upi_collect', category: 'COLLECT_REQUEST', weight: 55, severity: 'high',
    note: 'UPI collect / money request',
    patterns: [
      /\b(collect\s*(request|karo|karna|kar)|paise\s*(bhejo|transfer|karo)|money\s*(bhejo|transfer|send)\s+karo|pay\s*karo|payment\s*(kar|karo|karna)|bhugtan)\b/i,
      /\b\d{10,}\s*@\s*(ok\w+|ybl|paytm|phonepe|upi)\b/i,
      /upi\s*(?:id|link|payment)\b[^.\n]{0,60}\b(share|send|scan|click|pay)/i,
    ] },
  { id: 'fake_payment_claim', category: 'UPI_FRAUD', weight: 50, severity: 'high',
    note: 'Claims payment was made / asks to confirm receipt',
    patterns: [
      /\b(i\s*(have|'ve)\s*(just\s*)?(sent|paid|transferred)|payment\s*(done|complete|sent|successful)|paise\s*(bhej|transfer)\s*(diye|kar)\s*(hai|hain)|paisa\s*(bhej|transfer)\s*diya)\b/i,
      /\b(confirm\s*(the\s*)?(payment|transaction|receipt)|check\s*(my\s*)?payment|payment\s*(verify|verification))\b/i,
      /\b(refund|amount)\s*(kar\s*diya|bhej\s*diya|transfer\s*kar\s*diya|refund\s*process\s*(kar|kiya|hogaya))\b/i,
    ] },
  { id: 'qr_scan', category: 'QR_FRAUD', weight: 40, severity: 'medium',
    note: 'Asks user to scan a QR code',
    patterns: [
      /\b(scan\s*(this\s*)?(the\s*)?qr|qr\s*code\s*(scan|hai)|scan\s*karo|qr\s*scan)\b/i,
    ] },
  { id: 'money_double', category: 'INVESTMENT_SCAM', weight: 50, severity: 'high',
    note: 'Money-doubling / guaranteed-return claim',
    patterns: [
      /\b(double\s*(your\s*)?(money|paise)|guaranteed\s*(return|profit)|100%\s*(return|profit|safe)|sure\s*(profit|return)|invest\s*\d+\s*(get|pao)\s*\d+)/i,
      /\b(trading\s*(bot|app|platform)|crypto\s*(investment|trading)|forex\s*(trading|signals))\b/i,
    ] },

  // ---- Bank / government / impersonation ----
  { id: 'bank_impersonation', category: 'BANK_IMPERSONATION', weight: 45, severity: 'high',
    note: 'Claims to be from a bank / card company',
    patterns: [
      /\b(i('m| am)\s*(calling|contacting)?\s*(from|of)\s*(your\s*)?(bank|sbi|hdfc|icici|axis|kotak|yes\s*bank|pnb|bob|indusind|bank\s*of\s*baroda)|bank\s*(se|se\s*baat)|customer\s*(care|service)\s*(of|se)\s*(your\s*)?bank)\b/i,
      /\b(your\s*(bank\s*)?account\s*(has\s*been|will\s*be|get)\s*(blocked|suspended|frozen|closed)|account\s*(block|freeze|suspend)\s*(ho|hoga|kar))\b/i,
      /\b(card\s*(will\s*be|get)\s*(blocked|deactivated|suspended)|debit\s*card\s*(block|freeze)|credit\s*card\s*(block|freeze))\b/i,
    ] },
  { id: 'gov_impersonation', category: 'GOV_IMPERSONATION', weight: 50, severity: 'high',
    note: 'Claims to be police / government / court',
    patterns: [
      /\b(i('m| am)\s*(a\s*)?(police|inspector|officer)|cyber\s*(crime|cell|police)|f\s*\d+\s*police|thana|ps\s*\w+|district\s*police|enforcement\s*directorate)\b/i,
      /\b(your\s*(aadhaar|pan|account|number)\s*(is\s*)?(linked|involved|associated)\s*(in|with)\s*(a\s*)?(case|fraud|crime)| FIR\b|fir\s*(number|no)|court\s*(order|notice|case)|warrant)\b/i,
      /\b(money\s*laundering|illegal\s*(activity|transaction)|suspicious\s*transaction\s*report|\bstr\b)/i,
    ] },
  { id: 'kyc_scam', category: 'KYC_SCAM', weight: 45, severity: 'high',
    note: 'KYC / Aadhaar / PAN update fraud',
    patterns: [
      /\b(kyc\s*(update|expired|expiring|pending|verify|verification|renew)|aadhar\s*(update|link|verify|seeding)|aadhaar\s*(update|link|verify|seeding)|pan\s*(card\s*)?(update|link|verify|seeding))\b/i,
      /\b(kyc\s*(document|details?|form)|update\s*your\s*kyc|kyc\s*expir)\b/i,
    ] },
  { id: 'courier_scam', category: 'COURIER_SCAM', weight: 40, severity: 'medium',
    note: 'Fake parcel / courier redelivery',
    patterns: [
      /\b(your\s*(parcel|package|shipment|order|consignment)\s*(is|was|has|been|got)?\s*\w*\s*(held|stuck|delayed|returned|undelivered|bounced)|redelivery\s*(fee|charge)|customs\s*(fee|duty|charge)|out\s*for\s*delivery\s*(failed|issue))\b/i,
      /\b(delivery|customs|redelivery|release|clearance)\s*(charges?|fees?|dues?|payment)\b/i,
      /\b(delhivery|bluedart|blue\s*dart|dtdc|ekart|shadowfax|xpressbees|india\s*post|speed\s*post)\b[^.\n]{0,80}\b(fee|charge|payment|customs|held|address)/i,
    ] },
  { id: 'job_scam', category: 'JOB_SCAM', weight: 40, severity: 'medium',
    note: 'Fake job / work-from-home offer',
    patterns: [
      /\b(congratulations|congrats)[^.\n]{0,60}\b(job|offer|position|selected|hired|interview)\b/i,
      /\b(work\s*from\s*home[^.\n]{0,60}\b(earn|₹|rs\.?|income|part\s*time)|data\s*entry\s*(job|work)|part\s*time\s*(job|work)[^.\n]{0,60}\b(earn|₹|rs\.?))\b/i,
      /\b(registration\s*fee|processing\s*fee|interview\s*fee|training\s*fee|security\s*deposit|advance\s*(fee|payment))\b/i,
      /\b(we\s*(are|'re)\s*hiring|urgent\s*hiring|immediate\s*joining|no\s*experience\s*needed[^.\n]{0,40}earn)\b/i,
    ] },
  { id: 'prize_scam', category: 'PRIZE_SCAM', weight: 45, severity: 'high',
    note: 'Lottery / prize / giveaway claim',
    patterns: [
      /\b(congratulations|lucky|winner|won|selected)[^.\n]{0,60}\b(lottery|prize|jackpot|giveaway|reward|gift\s*card|cash\s*prize|lucky\s*draw)\b/i,
      /\b(you\s*have\s*won|claim\s*your\s*prize|claim\s*reward|collect\s*your\s*prize)\b/i,
    ] },
  { id: 'loan_scam', category: 'LOAN_SCAM', weight: 35, severity: 'medium',
    note: 'Loan / advance-fee solicitation',
    patterns: [
      /\b(loan\s*(approved|sanctioned)|pre[- ]?approved\s*loan|instant\s*loan\s*(approved|offer)|loan\s*offer)\b/i,
      /\b(advance\s*fee|processing\s*fee|documentation\s*fee|gst\s*on\s*loan|loan\s*ka\s*charge)\b/i,
    ] },
  { id: 'romance_scam', category: 'ROMANCE_SCAM', weight: 35, severity: 'medium',
    note: 'Romance / emotional manipulation',
    patterns: [
      /\b(i\s*miss\s*you|i\s*love\s*you|darling|baby\s*(i|this)|sweetheart|my\s*love)\b[^.\n]{0,80}\b(money|help|emergency|hospital|urgent|surgery|visa)\b/i,
      /\b(emergency\s*(need|situation)|hospitalized|surgery|visa\s*(fee|processing)|stranded\s*abroad|need\s*urgent\s*(help|money))\b/i,
    ] },
  { id: 'tech_support', category: 'TECH_SUPPORT', weight: 45, severity: 'high',
    note: 'Tech-support / remote-access scam',
    patterns: [
      /\b(your\s*(computer|laptop|phone|device|account|profile)\s*(has\s*been\s*)?(hacked|compromised|infected|blocked|suspended)|virus\s*detected|malware\s*detected)\b/i,
      /\b(anydesk|teamviewer|ultraviewer|screen\s*share|remote\s*(access|desktop)|install\s*(this\s*)?(app|software))\b/i,
      /\b(microsoft|google|apple|amazon)\s*(support|customer\s*care|helpline)\b/i,
    ] },
  { id: 'account_recovery', category: 'ACCOUNT_RECOVERY', weight: 40, severity: 'medium',
    note: 'Account recovery / social-media takeover',
    patterns: [
      /\b(your\s*(whatsapp|instagram|facebook|account)\s*(will\s*be|is\s*going\s*to\s*be|get)\s*(blocked|banned|deleted|suspended)|account\s*(suspend|block|ban|delete)\s*(kar|hoga|soon))\b/i,
      /\b(otp\s*(for\s*)?(account|verification|recovery)|verification\s*code|recovery\s*code)\b/i,
    ] },
  { id: 'blackmail', category: 'BLACKMAIL', weight: 55, severity: 'critical',
    note: 'Threats / blackmail / sextortion',
    patterns: [
      /\b(i\s*(have|got)\s*(your\s*)?(photos|videos|chat|messages|nudes|private)|hacking\s*you|expose\s*you|post\s*(your|the)\s*(photos|videos)|public\s*karke|bech\s*ke)\b/i,
      /\b(pay\s*(me|us)?\s*₹?\d+|deposit\s*money|transfer\s*money)\b[^.\n]{0,50}\b(or\s*(else|warna)|else\s*i\s*will|warna\s*main)\b/i,
      /\b(sextortion|ransom|blackmail)\b/i,
    ] },
  { id: 'urgency_pressure', category: 'SOCIAL_ENGINEERING', weight: 25, severity: 'low',
    note: 'Urgency / pressure tactics',
    patterns: [
      /\b(urgent|immediately|right\s*now|asap|turant|jaldi|abhi\s*hi|last\s*chance|limited\s*time|expire\s*(today|soon|now)|act\s*fast|don't\s*(delay|wait|tell))\b/i,
    ] },
  { id: 'personal_data', category: 'DATA_THEFT', weight: 35, severity: 'medium',
    note: 'Requests personal documents/data',
    patterns: [
      /\b(share|send|upload|provide|batao|bhejo)\b[^.\n]{0,60}\b(aadhaar\s*(card|number|copy|photo)|pan\s*card|passport|driving\s*licen[cs]e|voter\s*id|bank\s*(statement|details)|salary\s*slip)\b/i,
      /\b(share|send|upload|provide|batao|bhejo)\b[^.\n]{0,60}\b(photo\s*(of\s*)?(your\s*)?(id|card)|selfie\s*(with|holding)|signature)\b/i,
    ] },
  { id: 'remote_access', category: 'TECH_SUPPORT', weight: 55, severity: 'high',
    note: 'Requests remote-access / screen share',
    patterns: [
      /\b(install|download|share|open)\b[^.\n]{0,60}\b(anydesk|teamviewer|ultraviewer|rustdesk|screen\s*share|remote\s*(access|control|desktop))\b/i,
    ] },
  { id: 'secrecy', category: 'SOCIAL_ENGINEERING', weight: 20, severity: 'low',
    note: 'Asks victim to keep it secret',
    patterns: [
      /\b(don'?t\s*(tell|inform|discuss|share)\s*(anyone|anybody|your\s*bank|family|friends)|keep\s*(this\s*)?(a\s*)?secret|chup\s*raho|kisi\s*(ko\s*)?mat\s*batao|do\s*not\s*share\s*with\s*anyone)\b/i,
    ] },
  { id: 'crypto_wallet', category: 'INVESTMENT_SCAM', weight: 40, severity: 'medium',
    note: 'Crypto wallet / seed phrase request',
    patterns: [
      /\b(seed\s*phrase|recovery\s*phrase|private\s*key|wallet\s*(phrase|key))\b[^.\n]{0,60}\b(share|send|give|enter|provide)\b/i,
      /\b(share|send|give|enter|provide)\b[^.\n]{0,60}\b(seed\s*phrase|recovery\s*phrase|private\s*key|wallet\s*(phrase|key))\b/i,
    ] },
  { id: 'donation_scam', category: 'DONATION_SCAM', weight: 30, severity: 'medium',
    note: 'Fake charity / donation request',
    patterns: [
      /\b(donate|donation|charity|charitable)\b[^.\n]{0,60}\b(urgent|immediately|help|victims?|disaster|covid|orphan|ngo)\b/i,
      /\b(crowdfunding|gofundme|milaap|ketto| GiveIndia)\b[^.\n]{0,60}\b(link|donate|contribute)\b/i,
    ] },
  { id: 'fake_delivery', category: 'COURIER_SCAM', weight: 35, severity: 'medium',
    note: 'Fake delivery / missed-call scam',
    patterns: [
      /\b(missed\s*call|missed\s*call\s*alert|unanswered\s*call)[^.\n]{0,60}\b(courier|delivery|parcel|package|post)\b/i,
      /\b(delivery\s*(boy|agent|person)[^.\n]{0,60}(wrong|incorrect|address|failed)|return\s*to\s*sender|re-?delivery\s*charges?)\b/i,
    ] },
]

// URL extraction + suspicious-domain heuristics (heuristic layer only;
// deep reputation checks happen server-side / via URLhaus in Stage 8).
const URL_RE = /https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+/gi
const SHORTENERS = /bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rebrand\.ly|shorturl|rb\.gy|tiny\.cc/i
const SUSPICIOUS_TLDS = /\.(xyz|top|tk|ml|ga|cf|gq|click|link|live|work|icu|cam|rest|quest|bond|cfd|sbs|zip|mov)$/i
const TRUSTED_DOMAINS = /(google|facebook|instagram|whatsapp|netflix|amazon\.in|flipkart|paytm|phonepe|google\.com|gov\.in|sbi\.co|hdfc\.com|icici\.com)/i

export function extractUrls(text = '') {
  return (text.match(URL_RE) || []).map(u => u.replace(/[.,;:!?)\]]+$/, ''))
}

export function analyzeUrl(url) {
  const flags = []
  let weight = 0
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    const host = u.hostname.toLowerCase()
    if (SHORTENERS.test(host)) { flags.push('URL shortener — destination hidden'); weight += 25 }
    if (SUSPICIOUS_TLDS.test(host)) { flags.push('High-risk TLD'); weight += 25 }
    const digits = (host.match(/\d/g) || []).length
    if (digits >= 6 && !TRUSTED_DOMAINS.test(host)) { flags.push('IP/numeric-style domain'); weight += 15 }
    if (/login|verify|secure|update|account|kyc|bank|otp/i.test(u.pathname) && !TRUSTED_DOMAINS.test(host)) {
      flags.push('Credential-harvesting path on untrusted domain'); weight += 20
    }
    if (/@/.test(host)) { flags.push('URL contains @ (possible spoof)'); weight += 30 }
    if (TRUSTED_DOMAINS.test(host)) { flags.push('Recognised domain'); weight -= 15 }
  } catch {
    flags.push('Unparseable URL'); weight += 20
  }
  return { url, flags, weight: Math.max(0, weight) }
}

function testRule(rule, text) {
  return rule.patterns.some(p => p.test(text))
}

// Analyse a single message. Returns flags, score (0-100), categories.
export function analyzeMessage(msg) {
  const text = typeof msg === 'string' ? msg : (msg.text || msg.content || '')
  const flags = []
  const categories = new Set()
  let raw = 0
  let maxSeverity = 'low'

  for (const rule of RULES) {
    if (testRule(rule, text)) {
      raw += rule.weight
      categories.add(rule.category)
      flags.push({ ruleId: rule.id, category: rule.category, note: rule.note, weight: rule.weight, severity: rule.severity })
      const order = { low: 0, medium: 1, high: 2, critical: 3 }
      if (order[rule.severity] > order[maxSeverity]) maxSeverity = rule.severity
    }
  }

  // URL analysis
  const urls = extractUrls(text)
  const urlResults = urls.map(analyzeUrl)
  for (const u of urlResults) {
    if (u.weight > 0) {
      raw += u.weight
      categories.add('PHISHING')
      flags.push({ ruleId: 'suspicious_url', category: 'PHISHING', note: u.flags.join('; '), weight: u.weight, severity: u.weight >= 40 ? 'high' : 'medium' })
      if (u.weight >= 40 && maxSeverity !== 'critical') maxSeverity = 'high'
    }
  }

  // Combine: multiple independent signals compound, single weak signals don't.
  const distinctRules = new Set(flags.filter(f => f.ruleId !== 'suspicious_url').map(f => f.ruleId))
  let score = Math.min(100, raw)
  if (distinctRules.size <= 1 && score < 45) score = Math.min(score, 35) // single weak signal cap
  if (distinctRules.size >= 3) score = Math.min(100, score + 10)          // corroboration bonus

  const severityOrder = { low: 'LOW', medium: 'MODERATE', high: 'HIGH', critical: 'CRITICAL' }
  return {
    text,
    score,
    riskLevel: score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 35 ? 'MODERATE' : score > 0 ? 'LOW' : 'NONE',
    severity: maxSeverity === 'low' && score === 0 ? 'none' : severityOrder[maxSeverity],
    flags,
    categories: [...categories],
    urls: urlResults,
    isSuspicious: score >= 35,
  }
}

// Aggregate message analyses into conversation/contact-level result.
export function aggregateConversation(messages) {
  const perMessage = messages.map(m => ({ ...m, analysis: analyzeMessage(m.text || m.content || '') }))
  const suspicious = perMessage.filter(m => m.analysis.isSuspicious)
  const categories = new Set()
  const urlSet = new Map()
  let evidenceScore = 0

  for (const m of suspicious) {
    m.analysis.categories.forEach(c => categories.add(c))
    m.analysis.urls.forEach(u => { if (u.weight > 0) urlSet.set(u.url, u) })
    evidenceScore += m.analysis.score
  }

  // Conversation risk: weighted by suspicious count + severity + recency.
  const suspiciousCount = suspicious.length
  const maxMsgScore = suspicious.length ? Math.max(...suspicious.map(m => m.analysis.score)) : 0
  const distinctCats = categories.size
  let risk = 0
  if (suspiciousCount > 0) {
    risk = Math.min(100,
      Math.min(45, suspiciousCount * 12) +          // volume
      Math.min(35, maxMsgScore * 0.35) +           // peak severity
      Math.min(20, distinctCats * 5)               // category diversity
    )
  }
  // decay slightly for very old single hits handled by caller passing recent window.
  const safetyScore = Math.max(0, 100 - Math.round(risk))

  const level = risk >= 80 ? 'CRITICAL' : risk >= 60 ? 'HIGH' : risk >= 40 ? 'MODERATE' : risk >= 15 ? 'LOW' : 'MINIMAL'
  return {
    riskScore: Math.round(risk),
    safetyScore,
    riskLevel: level,
    suspiciousCount,
    totalMessages: messages.length,
    categories: [...categories],
    suspiciousUrls: [...urlSet.values()],
    messages: perMessage,
    analyzedAt: new Date().toISOString(),
    engine: 'rules',
  }
}

export function riskColor(level) {
  return {
    MINIMAL: 'text-brand-600', LOW: 'text-brand-500', MODERATE: 'text-yellow-600',
    HIGH: 'text-orange-600', CRITICAL: 'text-red-600',
  }[level] || 'text-gray-500'
}
export function riskBg(level) {
  return {
    MINIMAL: 'bg-brand-50 border-brand-200', LOW: 'bg-brand-50 border-brand-200',
    MODERATE: 'bg-yellow-50 border-yellow-200', HIGH: 'bg-orange-50 border-orange-200',
    CRITICAL: 'bg-red-50 border-red-200',
  }[level] || 'bg-gray-50 border-gray-200'
}
