'use strict';
// Placeholders. Nothing is on sale. Raqeeb Pro does not exist yet, so every value here is empty on purpose.
// When a payment provider is chosen, the owner fills in ONE block below. Nothing else in the code changes.
module.exports = {
  provider: null,                 // 'polar' or 'gumroad' once chosen; null means "Pro is not on sale"
  polar: { organizationId: null, sandbox: true },
  gumroad: { productId: null },
  offlineGraceDays: 7,            // how long a paid key keeps working when the check cannot reach the internet
  deviceLabelPrefix: 'raqeeb'
};
