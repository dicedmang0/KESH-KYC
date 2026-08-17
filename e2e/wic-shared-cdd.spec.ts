import { test, expect, type Page } from '@playwright/test';

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';
const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';
const stamp = Date.now().toString().slice(-8);
const wicKtp = ('31' + stamp.padStart(14, '0')).slice(0, 16);
const ourCustomerKtp = ('32' + stamp.padStart(14, '0')).slice(0, 16);

async function apiLogin(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SYSADMIN_EMAIL, password: SYSADMIN_PASSWORD }),
  });
  if (!response.ok) throw new Error(`setup login failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

async function api(token: string, path: string, body: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`setup ${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SYSADMIN_EMAIL);
  await page.getByLabel('Password').fill(SYSADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

async function selectFirstAvailable(page: Page, selector: string) {
  const select = page.locator(selector);
  await expect.poll(async () =>
    select.locator('option').evaluateAll((options) =>
      options.filter((option) => option.getAttribute('value')).length,
    ),
  ).toBeGreaterThan(0);
  const value = await select.locator('option').evaluateAll((options) =>
    options.find((option) => option.getAttribute('value'))?.getAttribute('value') || '',
  );
  expect(value).not.toBe('');
  await select.selectOption(value);
}

test.describe.serial('WIC and Our Customer shared CDD form', () => {
  let sysToken: string;

  test.beforeAll(async () => {
    sysToken = await apiLogin();
  });

  test('WIC uses the shared form, persists all entered fields, and remains WIC on edit/detail', async ({ page }) => {
    await login(page);
    await page.goto('/applications/new?type=INDIVIDUAL');

    const commonLabels = [
      'Nama Lengkap', 'Alias', 'Tempat Lahir', 'Tanggal Lahir', 'Jenis Kelamin',
      'Kewarganegaraan', 'Telepon', 'Email', 'Nomor KTP', 'Nomor SIM',
      'Nomor Paspor', 'Jenis Identitas', 'Nomor Identitas', 'Alamat Identitas',
      'Alamat Domisili', 'Provinsi', 'Kota/Kabupaten', 'Kecamatan',
      'Kelurahan/Desa', 'Pekerjaan', 'Bidang Industri', 'Nama Perusahaan',
      'Alamat Perusahaan', 'Rentang Penghasilan', 'Sumber Dana',
      'Tujuan Hubungan Usaha', 'Saluran Distribusi',
    ];
    const shared = page.getByTestId('person-cdd-fields');
    await expect(page.getByLabel('Jenis Customer')).toHaveValue('OUR_CUSTOMER');
    await expect(page.locator('label[for=draft-monthly_income_range]')).toHaveText('Rentang Penghasilan');
    for (const label of commonLabels) {
      await expect(shared.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByText('Walk-In Customer', { exact: true })).toHaveCount(0);

    const fullName = page.locator('#draft-full_name');
    await fullName.evaluate((element) => {
      (window as typeof window & { __wicSharedInput?: Element }).__wicSharedInput = element;
    });
    await page.getByLabel('Jenis Customer').selectOption('WIC');
    for (const label of commonLabels) {
      await expect(shared.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByText('Walk-In Customer', { exact: true })).toBeVisible();
    expect(await fullName.evaluate((element) =>
      element === (window as typeof window & { __wicSharedInput?: Element }).__wicSharedInput,
    )).toBe(true);

    const typeContinuously = async (selector: string, value: string) => {
      const input = page.locator(selector);
      await input.click();
      await input.pressSequentially(value);
      await expect(input).toHaveValue(value);
      await expect(input).toBeFocused();
    };
    await typeContinuously('#draft-full_name', 'WIC LENGKAP ' + stamp);
    await typeContinuously('#draft-alias', 'ALIASWIC' + stamp);
    await typeContinuously('#draft-pob', 'JAKARTABARU');
    await page.locator('#draft-dob').fill('1991-02-03');
    await page.locator('#draft-phone').fill('0812' + stamp);
    await page.locator('#draft-email').fill('wic.' + stamp + '@example.test');
    await page.locator('#draft-ktp_number').fill(wicKtp);
    await page.locator('#draft-identity_type').selectOption('KTP');
    await page.locator('#draft-identity_number').fill(wicKtp);
    await page.locator('#draft-address_identity').fill('Jl. Identitas WIC No. 10');
    await page.locator('#draft-address_residential').fill('Jl. Domisili WIC No. 20');

    await selectFirstAvailable(page, '#draft-province_code');
    await selectFirstAvailable(page, '#draft-city_code');
    await selectFirstAvailable(page, '#draft-district_code');
    await selectFirstAvailable(page, '#draft-village_code');

    await selectFirstAvailable(page, '#draft-occupation');
    const source = page.locator('#draft-source_of_funds');
    await expect.poll(async () => source.locator('option').count()).toBeGreaterThan(1);
    const otherValue = await source.locator('option').evaluateAll((options) =>
      options.find((option) => option.textContent?.toLowerCase().includes('lainnya'))?.getAttribute('value') || '',
    );
    expect(otherValue).not.toBe('');
    await source.selectOption(otherValue);
    const sourceOther = source
      .locator('xpath=../..')
      .getByPlaceholder('Tuliskan keterangan lainnya');
    await sourceOther.click();
    await sourceOther.pressSequentially('Honor proyek sepuluh');
    await expect(sourceOther).toHaveValue('Honor proyek sepuluh');
    await expect(sourceOther).toBeFocused();

    await page.locator('#draft-wic_transaction_purpose').fill('Pembayaran keluarga');
    await page.locator('#draft-wic_recipient_relationship').fill('Keluarga');

    const createdResponse = page.waitForResponse((response) =>
      response.url() === API_BASE_URL + '/applications/individual' &&
      response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan Aplikasi' }).click();
    const created = await createdResponse;
    const createdText = await created.text();
    expect(created.status(), createdText).toBe(201);
    const appId = String(JSON.parse(createdText).id);
    const requestBody = created.request().postDataJSON();
    expect(requestBody.cif_relationship_type).toBe('WIC');
    expect(requestBody.alias).toBe('ALIASWIC' + stamp);
    expect(requestBody.address_residential).toBe('Jl. Domisili WIC No. 20');
    expect(requestBody.source_of_funds_other).toBe('Honor proyek sepuluh');
    expect(requestBody).not.toHaveProperty('monthly_income_range');
    await page.waitForURL('**/users/*');

    await expect(page.getByText('WIC', { exact: true }).first()).toBeVisible();
    await expect(page.locator('#draft-alias')).toHaveValue('ALIASWIC' + stamp);
    await expect(page.locator('#draft-address_residential')).toHaveValue('Jl. Domisili WIC No. 20');
    await expect(page.locator('#draft-source_of_funds')).toHaveValue(otherValue);
    await expect(page.locator('#draft-monthly_income_range')).toHaveValue('');
    await expect(page.getByText('Tidak diterbitkan (WIC)', { exact: true })).toBeVisible();

    await page.locator('#draft-alias').fill('WIC EDIT ' + stamp);
    const updatedResponse = page.waitForResponse((response) =>
      response.url().includes('/applications/') && response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Data' }).click();
    const updated = await updatedResponse;
    expect(updated.status(), await updated.text()).toBe(200);
    expect(updated.request().postDataJSON()).toEqual({ alias: 'WIC EDIT ' + stamp });
    await expect(page.locator('#draft-alias')).toHaveValue('WIC EDIT ' + stamp);
    await expect(page.getByText('WIC', { exact: true }).first()).toBeVisible();

    for (const doc_type of ['WIC_IDENTITY_DOCUMENT', 'WIC_SIGNATURE_BIOMETRIC']) {
      await api(sysToken, `/applications/${appId}/documents`, {
        doc_type,
        file_uri: `https://storage.test/${doc_type}-${stamp}.jpg`,
      });
    }
    const submittedResponse = page.waitForResponse((response) =>
      response.url() === `${API_BASE_URL}/applications/${appId}/submit` &&
      response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Ajukan', exact: true }).click();
    const submitted = await submittedResponse;
    expect(submitted.status(), await submitted.text()).toBe(200);
  });

  test('Our Customer keeps the same shared form and existing CIF behavior', async ({ page }) => {
    await login(page);
    await page.goto('/applications/new?type=INDIVIDUAL');
    await expect(page.getByLabel('Jenis Customer')).toHaveValue('OUR_CUSTOMER');
    await expect(page.getByTestId('person-cdd-fields')).toBeVisible();
    await expect(page.locator('label[for=draft-monthly_income_range]')).toHaveText('Rentang Penghasilan');
    await expect(page.getByText('Walk-In Customer', { exact: true })).toHaveCount(0);

    await page.locator('#draft-full_name').fill('OUR CUSTOMER ' + stamp);
    await page.locator('#draft-pob').fill('Jakarta');
    await page.locator('#draft-dob').fill('1988-04-05');
    await page.locator('#draft-phone').fill('0821' + stamp);
    await page.locator('#draft-ktp_number').fill(ourCustomerKtp);
    await page.locator('#draft-address_identity').fill('Jl. Identitas Our Customer No. 1');
    await selectFirstAvailable(page, '#draft-occupation');

    const createdResponse = page.waitForResponse((response) =>
      response.url() === API_BASE_URL + '/applications/individual' &&
      response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan Aplikasi' }).click();
    const created = await createdResponse;
    const createdText = await created.text();
    expect(created.status(), createdText).toBe(201);
    const appId = String(JSON.parse(createdText).id);
    const requestBody = created.request().postDataJSON();
    expect(requestBody.cif_relationship_type).toBe('OUR_CUSTOMER');
    expect(requestBody).not.toHaveProperty('monthly_income_range');
    await page.waitForURL('**/users/*');
    await expect(page.getByText('Our Customer', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^KSHI\d{11}$/).first()).toBeVisible();
    await expect(page.locator('#draft-monthly_income_range')).toHaveValue('');

    await selectFirstAvailable(page, '#draft-monthly_income_range');
    const populatedValue = await page.locator('#draft-monthly_income_range').inputValue();
    const populatedResponse = page.waitForResponse((response) =>
      response.url() === `${API_BASE_URL}/applications/${appId}` && response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Data', exact: true }).click();
    const populated = await populatedResponse;
    expect(populated.status(), await populated.text()).toBe(200);
    expect(populated.request().postDataJSON()).toEqual({ monthly_income_range: populatedValue });

    await page.locator('#draft-monthly_income_range').selectOption('');
    const clearedResponse = page.waitForResponse((response) =>
      response.url() === `${API_BASE_URL}/applications/${appId}` && response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Data', exact: true }).click();
    const cleared = await clearedResponse;
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect(cleared.request().postDataJSON()).toEqual({ monthly_income_range: null });
    await expect(page.locator('#draft-monthly_income_range')).toHaveValue('');

    for (const doc_type of ['INDIVIDUAL_KTP_PHOTO', 'INDIVIDUAL_FACE_PHOTO', 'INDIVIDUAL_FACE_WITH_KTP_PHOTO']) {
      await api(sysToken, `/applications/${appId}/documents`, {
        doc_type,
        file_uri: `https://storage.test/${doc_type}-${stamp}.jpg`,
      });
    }
    const submittedResponse = page.waitForResponse((response) =>
      response.url() === `${API_BASE_URL}/applications/${appId}/submit` &&
      response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Ajukan', exact: true }).click();
    const submitted = await submittedResponse;
    expect(submitted.status(), await submitted.text()).toBe(200);
  });
});
