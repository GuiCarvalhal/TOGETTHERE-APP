// One place that turns an import/filing failure into user-facing copy, so the
// Home pending-import card and the Journey Inbox always say the same thing.
//
//  - 422 with `missing` codes: the reservation lacks the standard item's minimum
//    data. Name the fields instead of "something went wrong".
//  - 409: the row was already resolved (another tab or device). Callers should
//    drop it from the list instead of showing an error.
export function describeImportFailure(error, t, fallbackTitle) {
  const data = error?.response?.data || {};
  const status = error?.response?.status;

  if (status === 409) {
    return { title: t('inbox.alreadyResolved'), resolved: true };
  }

  const missing = Array.isArray(data.missing) ? data.missing : [];
  if (missing.length) {
    const fields = missing.map((code) => t('home.importBlocked_' + code)).join(', ');
    return {
      title: t('home.importBlockedToastTitle'),
      description: t('home.importBlockedHint', { fields }),
    };
  }

  return {
    title: fallbackTitle || t('inbox.fileFailed'),
    description: error?.message || t('common.error'),
  };
}