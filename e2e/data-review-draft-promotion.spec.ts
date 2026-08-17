import { test, expect, type Page } from '@playwright/test';

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';
const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';
const COMPLIANCE_EMAIL = process.env.E2E_COMPLIANCE_EMAIL || 'admin@example.com';
const COMPLIANCE_PASSWORD = process.env.E2E_COMPLIANCE_PASSWORD || 'Admin123!';
const ROLE_PASSWORD = 'Test@12345';
const ts = Date.now().toString().slice(-7);
const OLD_ADDRESS = 'Jl. Sudirman No. 1, Jakarta';
const NEW_ADDRESS = 'Jl. Asia Afrika No. 8, Bandung';

async function api<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`setup: ${path} -> ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`setup: login failed for ${email}: ${res.status}`);
  return (await res.json()).access_token;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

async function switchRole(page: Page, email: string, password: string) {
  const logout = page.getByRole('button', { name: 'Keluar' });
  if (await logout.count()) { await logout.click(); await page.waitForURL('**/login'); }
  await login(page, email, password);
}

async function createRoleViaFE(page: Page, email: string, role: 'FrontDesk' | 'Auditor') {
  await page.goto('/settings');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Nama').fill(`PW DR ${role} ${ts}`);
  await page.getByLabel('Role').selectOption(role);
  await page.getByLabel('Password awal').fill(ROLE_PASSWORD);
  const response = page.waitForResponse((r) => r.url().includes('/users/admins') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Buat Admin' }).click();
  expect((await response).status()).toBe(201);
}

async function seedApprovedIndividual(token: string, seq: string): Promise<string> {
  const created = await api<{ id: string | number }>(token, '/applications/individual', {
    method: 'POST', body: {
      full_name: `PW Pengkinian ${seq} ${ts}`, ktp_number: '3175001234567890', identity_type: 'KTP',
      identity_number: `37${seq}${ts}`, address_identity: OLD_ADDRESS, pob: 'Jakarta', dob: '1990-01-01',
      nationality: 'ID', phone: `0858${seq}${ts}`, occupation: 'Karyawan Swasta', gender: 'M',
      signature_uri: 'https://storage.test/pw_sig.png', source_of_funds: 'Gaji',
      monthly_income_range: 'Rata-rata Rp5 juta sampai Rp10 juta per bulan',
    },
  });
  const id = String(created.id);
  for (const doc_type of ['INDIVIDUAL_KTP_PHOTO', 'INDIVIDUAL_FACE_PHOTO', 'INDIVIDUAL_FACE_WITH_KTP_PHOTO']) {
    await api(token, `/applications/${id}/documents`, { method: 'POST', body: { doc_type, file_uri: `https://storage.test/${doc_type}.jpg` } });
  }
  await api(token, `/applications/${id}/submit`, { method: 'PATCH' });
  await api(token, `/applications/${id}/decision`, { method: 'PATCH', body: { decision: 'APPROVED', reason: 'ADR-047 setup' } });
  return id;
}

async function seedApprovedBusiness(token: string) {
  const created = await api<{ id: string | number }>(token, '/applications/business', {
    method: 'POST', body: {
      legal_name: `PT PW Pengkinian ${ts}`, legal_form: 'PT', incorporation_date: '2020-01-01',
      deed_establishment_number: `AKTA-PW-${ts}`, business_license_number: `BLPW${ts}`,
      nib: `NIBPW${ts}`, npwp: `01${ts}0000000`.slice(0, 15), address_line: 'Jl. Bisnis Lama No. 1',
      city: 'Jakarta', province: 'DKI Jakarta', postal_code: '12345', business_activity: 'Perdagangan Umum',
      phone: `021${ts}`, source_of_funds: 'Hasil usaha',
    },
  });
  const id = String(created.id);
  const director = await api<{ id: number }>(token, `/applications/${id}/parties`, {
    method: 'POST', body: { role: 'DIRECTOR', full_name: `Direktur Lama ${ts}`, identity_type: 'KTP', identity_number: `3866${ts}` },
  });
  const shareholder = await api<{ id: number }>(token, `/applications/${id}/parties`, {
    method: 'POST', body: { role: 'SHAREHOLDER', full_name: `Pemegang Saham Lama ${ts}`, identity_type: 'KTP', identity_number: `3855${ts}`, ownership_percentage: 30 },
  });
  const documents: Record<string, number> = {};
  for (const doc_type of ['BUSINESS_DEED_ESTABLISHMENT_AMENDMENT', 'BUSINESS_LICENSE', 'BUSINESS_NPWP', 'BUSINESS_MANAGEMENT_IDENTITY', 'BUSINESS_SHAREHOLDER_IDENTITY_25']) {
    const doc = await api<{ id: number }>(token, `/applications/${id}/documents`, { method: 'POST', body: { doc_type, file_uri: `https://storage.test/live-${doc_type}.pdf` } });
    documents[doc_type] = doc.id;
  }
  await api(token, `/applications/${id}/submit`, { method: 'PATCH' });
  await api(token, `/applications/${id}/decision`, { method: 'PATCH', body: { decision: 'APPROVED', reason: 'ADR-047 business setup' } });
  return { id, directorId: director.id, shareholderId: shareholder.id, documents };
}

function reviewCard(page: Page) {
  return page.locator('div.rounded-xl').filter({ hasText: 'Pengkinian Data' }).first();
}

test.describe.serial('ADR-047 Pengkinian Data draft promotion', () => {
  let sysToken: string;
  let frontDesk: { email: string; password: string };
  let auditor: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    sysToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    frontDesk = { email: `pw.dr.fd.${ts}@test.local`, password: ROLE_PASSWORD };
    auditor = { email: `pw.dr.aud.${ts}@test.local`, password: ROLE_PASSWORD };
    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await createRoleViaFE(page, frontDesk.email, 'FrontDesk');
    await createRoleViaFE(page, auditor.email, 'Auditor');
    await page.close();
  });

  test('draft text inputs keep focus and DOM identity while editing locally', async ({ page }) => {
    const personAppId = await seedApprovedIndividual(sysToken, '00');
    const personReview = await api<{ id: string | number }>(sysToken, `/applications/${personAppId}/data-review/initiate`, { method: 'POST', body: {} });
    const personReviewId = String(personReview.id);
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/data-reviews/${personReviewId}/edit`);

    const draftMutationRequests: string[] = [];
    const requestListener = (request: { url: () => string; method: () => string }) => {
      if (request.url().includes(`/data-reviews/${personReviewId}/draft/`) && request.method() !== 'GET') {
        draftMutationRequests.push(`${request.method()} ${request.url()}`);
      }
    };
    page.on('request', requestListener);

    const typeContinuously = async (selector: string, value: string) => {
      const input = page.locator(selector);
      await input.fill('');
      await input.click();
      await input.evaluate((element) => { (window as typeof window & { __adr047Input?: Element }).__adr047Input = element; });
      await input.pressSequentially(value);
      await expect(input).toHaveValue(value);
      await expect(input).toBeFocused();
      expect(await input.evaluate((element) => element === (window as typeof window & { __adr047Input?: Element }).__adr047Input)).toBe(true);
    };

    await typeContinuously('#draft-full_name', 'ABCDEFGHIJ');
    await typeContinuously('#draft-alias', 'ALIASFOCUS');
    await typeContinuously('#draft-pob', 'KOTABARUXX');

    const source = page.locator('#draft-source_of_funds');
    const otherValue = await source.locator('option').evaluateAll((options) =>
      options.find((option) => option.textContent?.trim().toLowerCase() === 'lainnya')?.getAttribute('value') ?? '',
    );
    expect(otherValue).not.toBe('');
    await source.selectOption(otherValue);
    const otherInput = page.getByText('Keterangan Sumber Dana Lainnya', { exact: false }).locator('..').locator('input');
    await otherInput.click();
    await otherInput.evaluate((element) => { (window as typeof window & { __adr047Input?: Element }).__adr047Input = element; });
    await otherInput.pressSequentially('SUMBERLAINNYA');
    await expect(otherInput).toHaveValue('SUMBERLAINNYA');
    await expect(otherInput).toBeFocused();
    expect(await otherInput.evaluate((element) => element === (window as typeof window & { __adr047Input?: Element }).__adr047Input)).toBe(true);
    expect(draftMutationRequests).toEqual([]);

    page.off('request', requestListener);
    const beforeSave = await api<{ review: { version: number } }>(sysToken, `/data-reviews/${personReviewId}/draft`);
    const saved = page.waitForResponse((response) =>
      response.url().includes(`/data-reviews/${personReviewId}/draft/person`) && response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Draft', exact: true }).click();
    expect((await saved).status()).toBe(200);
    const afterSave = await api<{ review: { version: number } }>(sysToken, `/data-reviews/${personReviewId}/draft`);
    expect(afterSave.review.version).toBe(beforeSave.review.version + 1);

    const business = await seedApprovedBusiness(sysToken);
    const businessReview = await api<{ id: string | number }>(sysToken, `/applications/${business.id}/data-review/initiate`, { method: 'POST', body: {} });
    await page.goto(`/data-reviews/${businessReview.id}/edit`);
    const businessDraftMutations: string[] = [];
    const businessRequestListener = (request: { url: () => string; method: () => string }) => {
      if (request.url().includes(`/data-reviews/${businessReview.id}/draft/business`) && request.method() !== 'GET') {
        businessDraftMutations.push(`${request.method()} ${request.url()}`);
      }
    };
    page.on('request', businessRequestListener);
    await typeContinuously('#biz-legal_name', 'ABCDEFGHIJ');
    await typeContinuously('#biz-trade_name', 'TRADEFOCUS');
    expect(businessDraftMutations).toEqual([]);
    page.off('request', businessRequestListener);

    // A save/refetch in another draft section must not discard unsaved scalar edits.
    const partyEditor = page.getByTestId('draft-party-editor');
    await partyEditor.getByRole('button', { name: 'Tambah Party' }).click();
    await partyEditor.getByLabel('Peran Party').selectOption('BO');
    await partyEditor.getByLabel('Nama Lengkap Party').fill('BO REFRESH TEST');
    await partyEditor.getByRole('button', { name: 'Simpan Party ke Draft' }).click();
    await expect(page.locator('#biz-legal_name')).toHaveValue('ABCDEFGHIJ');
    await expect(page.locator('#biz-trade_name')).toHaveValue('TRADEFOCUS');

    await page.goto(`/data-reviews/${personReviewId}/edit`);
    await page.getByRole('button', { name: 'Ajukan untuk Review Compliance' }).click();
    await page.goto(`/data-reviews/${personReviewId}/edit`);
    await expect(page.getByText('Draft terkunci')).toBeVisible();
    await expect(page.locator('#draft-full_name')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Simpan Draft', exact: true })).toHaveCount(0);
  });

  test('INDIVIDUAL: draft stays staged, RETURN preserves it, APPROVE promotes it', async ({ page }) => {
    const appId = await seedApprovedIndividual(sysToken, '01');
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/users/${appId}`);
    const initiated = page.waitForResponse((r) => r.url().includes('/data-review/initiate') && r.request().method() === 'POST');
    await reviewCard(page).getByRole('button', { name: 'Mulai Pengkinian Data' }).click();
    const reviewId = String((await (await initiated).json()).id);
    await reviewCard(page).getByRole('link', { name: 'Perbarui Data' }).click();
    await expect(page.getByTestId('draft-context-banner')).toContainText('belum berlaku');
    await page.locator('#draft-address_identity').fill(NEW_ADDRESS);
    await expect(page.locator('#draft-monthly_income_range')).toHaveValue('Rata-rata Rp5 juta sampai Rp10 juta per bulan');
    await page.locator('#draft-monthly_income_range').selectOption('');
    await page.locator('#draft-source_of_funds').selectOption({ label: 'Gaji' }).catch(() => undefined);
    await page.getByRole('button', { name: 'Simpan Draft', exact: true }).click();
    await expect(page.getByTestId('data-review-diff')).toContainText(NEW_ADDRESS);
    const liveBeforeApproval = await api<{ person: { address_identity: string; monthly_income_range: string | null } }>(sysToken, `/applications/${appId}`);
    expect(liveBeforeApproval.person.address_identity).toBe(OLD_ADDRESS);
    expect(liveBeforeApproval.person.monthly_income_range).toBe('Rata-rata Rp5 juta sampai Rp10 juta per bulan');

    await page.getByRole('button', { name: 'Ajukan untuk Review Compliance' }).click();
    await page.waitForURL(`**/users/${appId}`);
    await page.goto(`/data-reviews/${reviewId}/edit`);
    await expect(page.getByText('Draft terkunci')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simpan Draft', exact: true })).toHaveCount(0);

    await switchRole(page, auditor.email, auditor.password);
    await page.goto(`/data-reviews/${reviewId}/edit`);
    await expect(page.getByTestId('data-review-diff')).toContainText(NEW_ADDRESS);
    await expect(page.getByTestId('compliance-decision-panel')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Simpan Draft', exact: true })).toHaveCount(0);

    await switchRole(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/data-reviews/${reviewId}/edit`);
    const diff = page.getByTestId('data-review-diff');
    await expect(diff).toContainText(OLD_ADDRESS);
    await expect(diff).toContainText(NEW_ADDRESS);
    await expect(diff).toContainText('Rentang Penghasilan');
    await expect(diff).toContainText('Rata-rata Rp5 juta sampai Rp10 juta per bulan');
    await expect(diff).toContainText('—');
    const panel = page.getByTestId('compliance-decision-panel');
    await panel.getByRole('button', { name: 'Kembalikan untuk Revisi' }).click();
    await page.locator('#compliance-decision-notes').fill('Mohon periksa kembali alamat dan nomor telepon.');
    await panel.getByRole('button', { name: 'Konfirmasi Keputusan' }).click();
    await expect(page.getByText('Catatan Compliance:')).toBeVisible();
    await expect(page.getByTestId('data-review-diff')).toContainText(NEW_ADDRESS);

    await switchRole(page, frontDesk.email, frontDesk.password);
    await page.goto(`/data-reviews/${reviewId}/edit`);
    await page.locator('#draft-phone').fill(`0812${ts}`);
    await page.getByRole('button', { name: 'Simpan Draft', exact: true }).click();
    await expect(page.getByTestId('data-review-diff')).toContainText(`0812${ts}`);
    await page.getByRole('button', { name: 'Ajukan untuk Review Compliance' }).click();

    await switchRole(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/data-reviews/${reviewId}/edit`);
    const approvePanel = page.getByTestId('compliance-decision-panel');
    await approvePanel.getByRole('button', { name: 'Setujui' }).click();
    await approvePanel.getByRole('button', { name: 'Konfirmasi Keputusan' }).click();
    await page.waitForURL(`**/users/${appId}`);
    const live = await api<{ person: { address_identity: string; phone: string; monthly_income_range: string | null } }>(sysToken, `/applications/${appId}`);
    expect(live.person.address_identity).toBe(NEW_ADDRESS);
    expect(live.person.phone).toBe(`0812${ts}`);
    expect(live.person.monthly_income_range).toBeNull();
    await expect(page.locator('#draft-address_identity')).toHaveValue(NEW_ADDRESS);
    await expect(page.locator('#draft-monthly_income_range')).toHaveValue('');
  });

  test('BUSINESS: scalar, Party/BO ADD UPDATE DELETE, document ADD REPLACE DELETE, and EDD are staged', async ({ page }) => {
    const seeded = await seedApprovedBusiness(sysToken);
    const review = await api<{ id: string | number }>(sysToken, `/applications/${seeded.id}/data-review/initiate`, { method: 'POST', body: {} });
    const reviewId = String(review.id);
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/data-reviews/${reviewId}/edit`);

    await page.locator('#biz-legal_name').fill(`PT PW Pengkinian Baru ${ts}`);
    await page.locator('#biz-deed_latest_amendment_number').fill(`AKTA-UBAH-${ts}`);
    await page.getByRole('button', { name: 'Simpan Draft', exact: true }).click();

    const partyEditor = page.getByTestId('draft-party-editor');
    await partyEditor.getByRole('button', { name: 'Tambah Party' }).click();
    await partyEditor.getByLabel('Peran Party').selectOption('BO');
    await partyEditor.getByLabel('Nama Lengkap Party').fill(`BO Baru ${ts}`);
    await partyEditor.getByLabel('Nomor Identitas Party').fill(`3877${ts}`);
    await partyEditor.getByRole('button', { name: 'Simpan Party ke Draft' }).click();
    await expect(partyEditor).toContainText(`BO Baru ${ts}`);

    const directorRow = partyEditor.locator('tr').filter({ hasText: `Direktur Lama ${ts}` });
    await directorRow.getByRole('button', { name: 'Ubah' }).click();
    await partyEditor.getByLabel('Alamat Party').fill('Jl. Direktur Baru No. 9');
    await partyEditor.getByRole('button', { name: 'Simpan Party ke Draft' }).click();
    const shareholderRow = partyEditor.locator('tr').filter({ hasText: `Pemegang Saham Lama ${ts}` });
    await shareholderRow.getByRole('button', { name: 'Hapus' }).click();
    await expect(shareholderRow).toContainText('Dihapus');

    const docEditor = page.getByTestId('draft-document-editor');
    await docEditor.getByLabel('Jenis Dokumen Draft').selectOption('EDD_ADDITIONAL_DOCUMENT');
    await docEditor.getByLabel('Berkas Dokumen Draft').setInputFiles('references/kesh-admin-login.png');
    await docEditor.getByRole('button', { name: 'Tambahkan ke Draft' }).click();
    await expect(docEditor).toContainText('Dokumen Tambahan EDD');
    const npwpCard = docEditor.locator('div.rounded-lg').filter({ hasText: 'NPWP Badan Usaha' }).first();
    await npwpCard.getByRole('button', { name: 'Ganti' }).click();
    await docEditor.getByLabel('Berkas Dokumen Draft').setInputFiles('references/kesh-admin-dashboard.png');
    await docEditor.getByRole('button', { name: 'Ganti di Draft' }).click();
    const licenseCard = docEditor.locator('div.rounded-lg').filter({ hasText: 'NIB / Izin Usaha' }).first();
    await licenseCard.getByRole('button', { name: 'Hapus' }).click();

    const edd = page.getByTestId('draft-edd-editor');
    await edd.getByRole('button', { name: 'III. Informasi Tambahan yang Wajib Dikumpulkan' }).click();
    const section = edd.locator('div.rounded-lg').filter({ hasText: 'III. Informasi Tambahan yang Wajib Dikumpulkan' }).first();
    await section.getByRole('combobox').nth(0).selectOption('Kegiatan usaha atau transaksi bisnis');
    await section.getByRole('combobox').nth(1).selectOption('Hasil usaha');
    await edd.getByRole('button', { name: 'Simpan Draft EDD' }).click();

    const before = await api<{ business: { legal_name: string }; parties: { id: number; address: string; is_active: boolean }[]; documents: { id: number; doc_type: string; file_uri: string }[]; edd: unknown }>(sysToken, `/applications/${seeded.id}`);
    expect(before.business.legal_name).toBe(`PT PW Pengkinian ${ts}`);
    expect(before.parties.find((p) => p.id === seeded.directorId)?.address).not.toBe('Jl. Direktur Baru No. 9');
    expect(before.parties.find((p) => p.id === seeded.shareholderId)?.is_active).toBe(true);
    expect(before.documents.find((d) => d.id === seeded.documents.BUSINESS_NPWP)?.file_uri).toContain('live-BUSINESS_NPWP');
    expect(before.documents.some((d) => d.doc_type === 'EDD_ADDITIONAL_DOCUMENT')).toBe(false);

    const draftDiff = page.getByTestId('data-review-diff');
    await expect(draftDiff).toContainText('Pengurus / Pemegang Saham');
    await expect(draftDiff).toContainText('Dokumen');
    await expect(draftDiff).toContainText('EDD');
    await page.getByRole('button', { name: 'Ajukan untuk Review Compliance' }).click();

    await switchRole(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/data-reviews/${reviewId}/edit`);
    await expect(page.getByTestId('data-review-diff')).toContainText('Ditambahkan');
    await expect(page.getByTestId('data-review-diff')).toContainText('Diganti');
    await expect(page.getByTestId('data-review-diff')).toContainText('Dihapus');
    const panel = page.getByTestId('compliance-decision-panel');
    await panel.getByRole('button', { name: 'Setujui' }).click();
    await panel.getByRole('button', { name: 'Konfirmasi Keputusan' }).click();
    await page.waitForURL(`**/users/${seeded.id}`);

    const after = await api<{ business: { legal_name: string; deed_latest_amendment_number: string }; parties: { role: string; full_name: string; address: string; is_active: boolean }[]; documents: { doc_type: string; file_uri: string }[] }>(sysToken, `/applications/${seeded.id}`);
    expect(after.business.legal_name).toBe(`PT PW Pengkinian Baru ${ts}`);
    expect(after.business.deed_latest_amendment_number).toBe(`AKTA-UBAH-${ts}`);
    expect(after.parties.some((p) => p.role === 'BO' && p.full_name === `BO Baru ${ts}` && p.is_active)).toBe(true);
    expect(after.parties.some((p) => p.address === 'Jl. Direktur Baru No. 9' && p.is_active)).toBe(true);
    expect(after.parties.some((p) => p.full_name === `Pemegang Saham Lama ${ts}` && p.is_active)).toBe(false);
    expect(after.documents.some((d) => d.doc_type === 'EDD_ADDITIONAL_DOCUMENT')).toBe(true);
    expect(after.documents.some((d) => d.doc_type === 'BUSINESS_LICENSE')).toBe(false);
    expect(after.documents.find((d) => d.doc_type === 'BUSINESS_NPWP')?.file_uri).not.toContain('live-BUSINESS_NPWP');
    const promotedEdd = await api<{ additional_information?: { source_of_funds?: string } }>(sysToken, `/applications/${seeded.id}/edd`);
    expect(promotedEdd.additional_information?.source_of_funds).toBe('Hasil usaha');
  });

  test('Compliance diff wraps long values on mobile with Indonesian BEFORE/AFTER labels', async ({ page }) => {
    const appId = await seedApprovedIndividual(sysToken, '04');
    const review = await api<{ id: string | number }>(sysToken, `/applications/${appId}/data-review/initiate`, { method: 'POST', body: {} });
    const reviewId = String(review.id);
    const longValue = 'Jl. Raya Bandung Soreang KM 25 Komplek Perumahan Griya Asri Permai Blok C2 No. 145 RT 007 RW 012 Kelurahan Pananjung';
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/data-reviews/${reviewId}/edit`);
    await page.locator('#draft-address_identity').fill(longValue);
    await page.getByRole('button', { name: 'Simpan Draft', exact: true }).click();
    await page.getByRole('button', { name: 'Ajukan untuk Review Compliance' }).click();
    await switchRole(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/data-reviews/${reviewId}/edit`);
    const diff = page.getByTestId('data-review-diff');
    await expect(diff.getByText('SEBELUM').nth(1)).toBeVisible();
    await expect(diff.getByText('SESUDAH').nth(1)).toBeVisible();
    const overflowing = await page.locator('body *').evaluateAll((elements) => elements
      .map((element) => ({
        tag: element.tagName,
        className: element.getAttribute('class'),
        text: element.textContent?.trim().slice(0, 80),
        right: Math.round(element.getBoundingClientRect().right),
      }))
      .filter((item) => item.right > document.documentElement.clientWidth + 1));
    expect(overflowing).toEqual([]);
  });
});
