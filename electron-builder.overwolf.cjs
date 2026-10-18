'use strict';
// Build configuration for the Overwolf edition (live game data), used with
// @overwolf/ow-electron-builder by .github/workflows/overwolf-build.yml.
// It reuses the standard "build" settings from package.json and adds
// Overwolf's options, which can't live in package.json because the standard
// electron-builder rejects unknown keys. The standard build is unchanged.
const {build}=require('./package.json');

// OW_QA_BUILD=1 builds the first QA submission without signing keys; Overwolf
// signs that one for QA only. Every other build must be Overwolf-signed.
const qa=process.env.OW_QA_BUILD==='1';

module.exports={
  ...build,
  win:{
    ...build.win,
    // Overwolf's packages only load from a signed exe, so exe signing (and
    // resource editing) must stay on here.
    signAndEditExecutable:true,
    artifactName:'Deadlock-Counter-Advisor-Overwolf-Setup-${version}.${ext}'
  },
  overwolf:{
    // Stop the build when Overwolf signing fails or credentials are missing,
    // instead of producing an unsigned build where live data cannot load.
    requireSigning:!qa,
    // Sign the app exe with Overwolf's certificate when the signing service
    // says this app is entitled to it. A certificate of our own (signtoolOptions
    // or azureSignOptions under "win") always takes priority. Installer not covered.
    enableOWCertSigning:!qa
  },
  // No update feed: until releases switch to this edition, it must not
  // auto-update to the standard build (which has no live data). Without
  // app-update.yml the app reports updates as unavailable.
  publish:null
};
