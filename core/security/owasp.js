'use strict';

/** OWASP Top 10 (2021) references used in every finding and report. */
const OWASP = {
  UNMAPPED: { name: 'OWASP 分類は要確認', url: 'https://owasp.org/Top10/' },
  A01: { name: 'Broken Access Control', url: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/' },
  A02: { name: 'Cryptographic Failures', url: 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/' },
  A03: { name: 'Injection', url: 'https://owasp.org/Top10/A03_2021-Injection/' },
  A05: { name: 'Security Misconfiguration', url: 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/' },
  A06: { name: 'Vulnerable and Outdated Components', url: 'https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/' },
  A07: { name: 'Identification and Authentication Failures', url: 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/' },
  A09: { name: 'Security Logging and Monitoring Failures', url: 'https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/' },
};

function finding({ id, title, severity, owasp, location, evidence, remediation, ...extra }) {
  return { id, title, severity, owasp: { id: owasp, ...OWASP[owasp] }, location, evidence, remediation, ...extra };
}

module.exports = { OWASP, finding };
