/**
 * Who the platform is, for the privacy notice (GDPR Art. 13(1)(a)-(b); DPDP s.5 and
 * DPDP Rules' notice requirements; DPDP s.8(10) grievance redressal; s.10 Data
 * Protection Officer for a Significant Data Fiduciary). Deployment configuration, not
 * code: the legal entity and named officers differ per environment and change over time.
 */
export function privacyController() {
  return {
    name: process.env.PRIVACY_CONTROLLER_NAME || "CoFounderAI",
    address: process.env.PRIVACY_CONTROLLER_ADDRESS || null,
    contactEmail: process.env.PRIVACY_CONTACT_EMAIL || null,
    grievanceOfficerName: process.env.GRIEVANCE_OFFICER_NAME || null,
    grievanceOfficerEmail: process.env.GRIEVANCE_OFFICER_EMAIL || process.env.PRIVACY_CONTACT_EMAIL || null,
  };
}
