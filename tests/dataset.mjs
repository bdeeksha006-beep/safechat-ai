// SafeChat AI test dataset
// Each case: { name, category, messages: [{from, text}], expectedRisk: 'low'|'high' }
// Used by tests/rules.test.mjs to measure precision/recall of the rule engine.

export const CASES = [
  // ---- Should be flagged (high risk) ----
  { name: 'bank_impersonation_otp', expectedRisk: 'high', messages: [
    { from: 'them', text: 'This is SBI bank. Your account will be blocked in 24 hours.' },
    { from: 'them', text: 'I need you to share the OTP sent to your phone to verify.' },
    { from: 'them', text: 'Do not tell anyone, this is confidential.' },
  ]},
  { name: 'upi_collect', expectedRisk: 'high', messages: [
    { from: 'them', text: 'Bhai mujhe 5000 rupaye chahiye urgent hai' },
    { from: 'them', text: 'Mera UPI id hai 9876543210@okaxis, collect request accept kar do' },
  ]},
  { name: 'kyc_update', expectedRisk: 'high', messages: [
    { from: 'them', text: 'Your KYC has expired. Update now or account will be frozen.' },
    { from: 'them', text: 'Share your Aadhaar card photo and PAN details on this link: http://verify-kyc.top/update' },
  ]},
  { name: 'job_fee', expectedRisk: 'high', messages: [
    { from: 'them', text: 'Congratulations! You are selected for a work from home job.' },
    { from: 'them', text: 'Pay Rs 499 registration fee to activate your account.' },
  ]},
  { name: 'courier_fee', expectedRisk: 'high', messages: [
    { from: 'them', text: 'Your parcel is held at customs. Pay Rs 250 delivery charges.' },
    { from: 'them', text: 'Link: https://bit.ly/3xTrack123' },
  ]},
  { name: 'prize', expectedRisk: 'high', messages: [
    { from: 'them', text: 'You have won Rs 5,00,000 in Lucky Draw! Claim your prize now.' },
  ]},
  { name: 'tech_support_remote', expectedRisk: 'high', messages: [
    { from: 'them', text: 'This is Microsoft support. Your computer is infected.' },
    { from: 'them', text: 'Install AnyDesk and share the ID so I can fix it.' },
  ]},
  { name: 'romance_emergency', expectedRisk: 'high', messages: [
    { from: 'them', text: 'My love, I am in hospital, I need emergency money for surgery.' },
    { from: 'them', text: 'Please send Rs 20000 urgently, I will pay you back.' },
  ]},
  { name: 'gov_police', expectedRisk: 'high', messages: [
    { from: 'them', text: 'I am Inspector Sharma from Cyber Crime cell.' },
    { from: 'them', text: 'Your Aadhaar is linked to a money laundering case. Pay fine or face arrest.' },
  ]},
  { name: 'phishing_link', expectedRisk: 'high', messages: [
    { from: 'them', text: 'Verify your account: http://secure-login.xyz/verify' },
  ]},
  { name: 'otp_direct', expectedRisk: 'high', messages: [
    { from: 'them', text: 'Share the OTP I just sent you, it is for verification.' },
  ]},
  { name: 'investment_double', expectedRisk: 'high', messages: [
    { from: 'them', text: 'Invest 10000 and get guaranteed 100% return in 7 days!' },
    { from: 'them', text: 'Our crypto trading bot is 100% safe, no risk.' },
  ]},

  // ---- Should NOT be flagged (low risk / false-positive checks) ----
  { name: 'normal_chat', expectedRisk: 'low', messages: [
    { from: 'me', text: 'Hey, are we still on for dinner tonight?' },
    { from: 'them', text: 'Yes! 7pm at the usual place?' },
    { from: 'me', text: 'Perfect, see you there.' },
  ]},
  { name: 'bank_word_harmless', expectedRisk: 'low', messages: [
    { from: 'them', text: 'I went to the bank today to deposit money.' },
    { from: 'me', text: 'Did you get the OTP for the transaction?' },
    { from: 'them', text: 'Yeah it worked fine, no issues.' },
  ]},
  { name: 'otp_context_safe', expectedRisk: 'low', messages: [
    { from: 'me', text: 'Did you receive the OTP I sent for the booking?' },
    { from: 'them', text: 'Yes got it, entering now.' },
  ]},
  { name: 'money_harmless', expectedRisk: 'low', messages: [
    { from: 'them', text: 'I need to transfer some money to mom this weekend.' },
    { from: 'me', text: 'Sure, let me know if you need help with the app.' },
  ]},
  { name: 'job_normal', expectedRisk: 'low', messages: [
    { from: 'them', text: 'I got a job offer at a startup, excited!' },
    { from: 'me', text: 'Congratulations! Which company?' },
  ]},
  { name: 'link_safe', expectedRisk: 'low', messages: [
    { from: 'them', text: 'Check this recipe: https://www.youtube.com/watch?v=abc123' },
  ]},
  { name: 'urgent_harmless', expectedRisk: 'low', messages: [
    { from: 'them', text: 'Urgent: can you pick up milk on your way home?' },
  ]},
]
