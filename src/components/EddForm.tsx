'use client';

import { useState } from 'react';

export type EddFormData = {
  nama_lengkap: string;
  nomor_identitas: string;
  jenis_identitas: string;
  alamat_domisili: string;
  pekerjaan_jenis_usaha: string;
  nomor_telepon: string;
  kategori_pengguna: string;
  nomor_referensi_cdd: string;
  karakteristik_pengguna: string[];
  pola_transaksi: string[];
  hasil_screening_checks: string[];
  klarifikasi_tambahan: string[];
  catatan_alasan_edd: string;
  tujuan_hubungan: string[];
  tujuan_lainnya: string;
  sumber_dana: string[];
  sumber_dana_lainnya: string;
  dokumen_sumber_dana: string[];
  dokumen_sumber_dana_lainnya: string;
  sumber_kekayaan: string[];
  sumber_kekayaan_lainnya: string;
  dokumen_sumber_kekayaan: string[];
  dokumen_sumber_kekayaan_lainnya: string;
  bertindak_untuk_pihak_lain: boolean;
  nama_bo: string;
  hubungan_bo: string;
  nomor_identitas_bo: string;
  alamat_bo: string;
  sumber_dana_kekayaan_bo: string;
  dokumen_bo: string[];
  konsistensi_data: string;
  penjelasan_konsistensi: string;
  kewajaran_transaksi: string;
  catatan_kewajaran: string;
  evaluasi_sumber_dana: string;
  penjelasan_evaluasi: string;
  risiko_geografis: string;
  risiko_produk: string;
  rangkuman_risiko: string;
  rekomendasi_tindak_lanjut: string[];
  keputusan_kepatuhan: string;
  alasan_keputusan_kepatuhan: string;
  nama_pejabat_kepatuhan: string;
  tanggal_kepatuhan: string;
  keputusan_direktur: string;
  alasan_keputusan_direktur: string;
  nama_direktur: string;
  tanggal_direktur: string;
  checklist_kelengkapan: string[];
};

export const DEFAULT_EDD: EddFormData = {
  nama_lengkap: '',
  nomor_identitas: '',
  jenis_identitas: '',
  alamat_domisili: '',
  pekerjaan_jenis_usaha: '',
  nomor_telepon: '',
  kategori_pengguna: '',
  nomor_referensi_cdd: '',
  karakteristik_pengguna: [],
  pola_transaksi: [],
  hasil_screening_checks: [],
  klarifikasi_tambahan: [],
  catatan_alasan_edd: '',
  tujuan_hubungan: [],
  tujuan_lainnya: '',
  sumber_dana: [],
  sumber_dana_lainnya: '',
  dokumen_sumber_dana: [],
  dokumen_sumber_dana_lainnya: '',
  sumber_kekayaan: [],
  sumber_kekayaan_lainnya: '',
  dokumen_sumber_kekayaan: [],
  dokumen_sumber_kekayaan_lainnya: '',
  bertindak_untuk_pihak_lain: false,
  nama_bo: '',
  hubungan_bo: '',
  nomor_identitas_bo: '',
  alamat_bo: '',
  sumber_dana_kekayaan_bo: '',
  dokumen_bo: [],
  konsistensi_data: '',
  penjelasan_konsistensi: '',
  kewajaran_transaksi: '',
  catatan_kewajaran: '',
  evaluasi_sumber_dana: '',
  penjelasan_evaluasi: '',
  risiko_geografis: '',
  risiko_produk: '',
  rangkuman_risiko: '',
  rekomendasi_tindak_lanjut: [],
  keputusan_kepatuhan: '',
  alasan_keputusan_kepatuhan: '',
  nama_pejabat_kepatuhan: '',
  tanggal_kepatuhan: '',
  keputusan_direktur: '',
  alasan_keputusan_direktur: '',
  nama_direktur: '',
  tanggal_direktur: '',
  checklist_kelengkapan: [],
};

interface EddFormProps {
  initialData?: Partial<EddFormData>;
  canEdit: boolean;
  eddCompleted: boolean;
  saving: boolean;
  saveError: string;
  onSaveDraft: (data: EddFormData) => void;
  onComplete: (data: EddFormData) => void;
}

function AccSection({
  title,
  index,
  open,
  onToggle,
  children,
}: {
  title: string;
  index: number;
  open: boolean;
  onToggle: (i: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-white">
      <button
        type="button"
        onClick={() => onToggle(index)}
        className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        {title}
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="border-t p-4 space-y-4">{children}</div>}
    </div>
  );
}

function CheckGroup({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="space-y-1.5">
      {label && <p className="text-xs font-semibold text-slate-600">{label}</p>}
      <div className="space-y-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => toggle(o.value)}
              disabled={disabled}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-kesh-700"
            />
            <span className="text-slate-700">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="rounded-md border px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-md border px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-md border bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      >
        <option value="">— Pilih —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        className="rounded-md border px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 resize-y"
      />
    </div>
  );
}

function RadioGroup({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <div className="flex flex-wrap gap-4">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={label}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              disabled={disabled}
              className="h-4 w-4 accent-kesh-700"
            />
            <span className="text-slate-700">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function EddForm({
  initialData,
  canEdit,
  eddCompleted,
  saving,
  saveError,
  onSaveDraft,
  onComplete,
}: EddFormProps) {
  const [d, setD] = useState<EddFormData>({ ...DEFAULT_EDD, ...initialData });
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));

  const set = <K extends keyof EddFormData>(k: K, v: EddFormData[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const toggleSection = (i: number) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const isOpen = (i: number) => openSections.has(i);

  const disabled = !canEdit;

  return (
    <div className="space-y-3">
      {saveError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{saveError}</div>
      )}

      {/* I. Data Dasar Pengguna Jasa */}
      <AccSection title="I. Data Dasar Pengguna Jasa" index={0} open={isOpen(0)} onToggle={toggleSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Nama Lengkap" value={d.nama_lengkap} onChange={(v) => set('nama_lengkap', v)} disabled={disabled} />
          <TextField label="Nomor Identitas" value={d.nomor_identitas} onChange={(v) => set('nomor_identitas', v)} disabled={disabled} />
          <TextField label="Jenis Identitas" value={d.jenis_identitas} onChange={(v) => set('jenis_identitas', v)} disabled={disabled} placeholder="KTP / SIM / Paspor" />
          <TextField label="Nomor Telepon" value={d.nomor_telepon} onChange={(v) => set('nomor_telepon', v)} disabled={disabled} />
          <TextField label="Pekerjaan / Jenis Usaha" value={d.pekerjaan_jenis_usaha} onChange={(v) => set('pekerjaan_jenis_usaha', v)} disabled={disabled} />
          <TextField label="Nomor Referensi CDD" value={d.nomor_referensi_cdd} onChange={(v) => set('nomor_referensi_cdd', v)} disabled={disabled} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextAreaField label="Alamat Domisili" value={d.alamat_domisili} onChange={(v) => set('alamat_domisili', v)} disabled={disabled} rows={2} />
          <SelectField
            label="Kategori Pengguna Jasa"
            value={d.kategori_pengguna}
            onChange={(v) => set('kategori_pengguna', v)}
            disabled={disabled}
            options={[
              { value: 'PERORANGAN', label: 'Perorangan' },
              { value: 'BADAN_USAHA', label: 'Badan Usaha' },
            ]}
          />
        </div>
      </AccSection>

      {/* II. Alasan High Risk */}
      <AccSection title="II. Alasan Pengguna Jasa Masuk Kategori High Risk" index={1} open={isOpen(1)} onToggle={toggleSection}>
        <div className="grid gap-6 sm:grid-cols-2">
          <CheckGroup
            label="A. Karakteristik Pengguna Jasa"
            selected={d.karakteristik_pengguna}
            onChange={(v) => set('karakteristik_pengguna', v)}
            disabled={disabled}
            options={[
              { value: 'PEP', label: 'PEP / keluarga / rekan dekat' },
              { value: 'USAHA_BERISIKO', label: 'Pekerjaan / jenis usaha berisiko tinggi' },
              { value: 'TIDAK_KOOPERATIF', label: 'Tidak kooperatif / data tidak konsisten' },
              { value: 'NOMINEE', label: 'Menggunakan pihak ketiga / nominee' },
              { value: 'AREA_RISIKO', label: 'Domisili di area risiko tinggi TPPU/TPPT' },
            ]}
          />
          <CheckGroup
            label="B. Pola Transaksi"
            selected={d.pola_transaksi}
            onChange={(v) => set('pola_transaksi', v)}
            disabled={disabled}
            options={[
              { value: 'NILAI_BESAR_BERULANG', label: 'Transaksi berulang nilai besar dalam jangka pendek' },
              { value: 'PERUBAHAN_MENDADAK', label: 'Perubahan mendadak frekuensi / nilai transaksi' },
              { value: 'TIDAK_SESUAI_PROFIL', label: 'Nilai transaksi tidak sesuai profil / penghasilan' },
              { value: 'BANYAK_PENERIMA', label: 'Banyak penerima berbeda tanpa penjelasan memadai' },
              { value: 'WILAYAH_RISIKO', label: 'Transaksi ke / dari wilayah risiko tinggi' },
            ]}
          />
          <CheckGroup
            label="C. Hasil Screening"
            selected={d.hasil_screening_checks}
            onChange={(v) => set('hasil_screening_checks', v)}
            disabled={disabled}
            options={[
              { value: 'NEAR_MATCH_DTTOT', label: 'Near match DTTOT' },
              { value: 'NEAR_MATCH_PPPSPM', label: 'Near match PPPSPM' },
              { value: 'ADVERSE_NEWS', label: 'Adverse / negative news dari sumber terpercaya' },
              { value: 'RED_FLAGS', label: 'Beberapa indikator red flags transaksi mencurigakan' },
            ]}
          />
          <CheckGroup
            label="D. Permintaan Klarifikasi Tambahan"
            selected={d.klarifikasi_tambahan}
            onChange={(v) => set('klarifikasi_tambahan', v)}
            disabled={disabled}
            options={[
              { value: 'CDD_TIDAK_LENGKAP', label: 'Form CDD tidak lengkap' },
              { value: 'DOKUMEN_DIRAGUKAN', label: 'Dokumen identitas / pendukung diragukan' },
              { value: 'TANDA_TANGAN_TIDAK_KONSISTEN', label: 'Tanda tangan tidak konsisten dengan identitas' },
            ]}
          />
        </div>
        <TextAreaField
          label="Catatan Ringkas Alasan EDD"
          value={d.catatan_alasan_edd}
          onChange={(v) => set('catatan_alasan_edd', v)}
          disabled={disabled}
          rows={3}
          placeholder="Jelaskan secara ringkas mengapa pengguna jasa ini masuk kategori high risk..."
        />
      </AccSection>

      {/* III. Informasi Tambahan */}
      <AccSection title="III. Informasi Tambahan yang Wajib Dikumpulkan" index={2} open={isOpen(2)} onToggle={toggleSection}>
        <div className="space-y-5">
          {/* A. Tujuan */}
          <div className="space-y-2">
            <CheckGroup
              label="A. Tujuan Hubungan Usaha / Transaksi"
              selected={d.tujuan_hubungan}
              onChange={(v) => set('tujuan_hubungan', v)}
              disabled={disabled}
              options={[
                { value: 'KIRIM_KELUARGA', label: 'Pengiriman uang keluarga' },
                { value: 'PEMBAYARAN_USAHA', label: 'Pembayaran usaha / kewajiban dagang' },
                { value: 'PEMBELIAN', label: 'Pembelian barang / jasa' },
                { value: 'PIHAK_KETIGA', label: 'Penyaluran dana melalui pihak ketiga' },
                { value: 'TUJUAN_LAINNYA', label: 'Lainnya' },
              ]}
            />
            {d.tujuan_hubungan.includes('TUJUAN_LAINNYA') && (
              <TextField
                label="Sebutkan tujuan lainnya"
                value={d.tujuan_lainnya}
                onChange={(v) => set('tujuan_lainnya', v)}
                disabled={disabled}
              />
            )}
          </div>

          {/* B. Sumber Dana */}
          <div className="space-y-2">
            <CheckGroup
              label="B. Sumber Dana"
              selected={d.sumber_dana}
              onChange={(v) => set('sumber_dana', v)}
              disabled={disabled}
              options={[
                { value: 'GAJI', label: 'Gaji / pendapatan tetap' },
                { value: 'HASIL_USAHA', label: 'Hasil usaha' },
                { value: 'PINJAMAN', label: 'Pinjaman' },
                { value: 'PENJUALAN_ASET', label: 'Penjualan aset' },
                { value: 'HADIAH', label: 'Hadiah / hibah' },
                { value: 'SUMBER_DANA_LAINNYA', label: 'Lainnya' },
              ]}
            />
            {d.sumber_dana.includes('SUMBER_DANA_LAINNYA') && (
              <TextField
                label="Sebutkan sumber dana lainnya"
                value={d.sumber_dana_lainnya}
                onChange={(v) => set('sumber_dana_lainnya', v)}
                disabled={disabled}
              />
            )}
            <div className="pl-4 border-l-2 border-slate-200 space-y-2">
              <CheckGroup
                label="Dokumen Pendukung Sumber Dana"
                selected={d.dokumen_sumber_dana}
                onChange={(v) => set('dokumen_sumber_dana', v)}
                disabled={disabled}
                options={[
                  { value: 'SLIP_GAJI', label: 'Slip gaji' },
                  { value: 'REKENING_KORAN', label: 'Rekening koran 3 bulan terakhir' },
                  { value: 'INVOICE', label: 'Invoice / bukti transaksi usaha' },
                  { value: 'FOTO_USAHA', label: 'Foto tempat usaha' },
                  { value: 'KONTRAK', label: 'Kontrak kerja / perjanjian bisnis' },
                  { value: 'DOK_DANA_LAINNYA', label: 'Lainnya' },
                ]}
              />
              {d.dokumen_sumber_dana.includes('DOK_DANA_LAINNYA') && (
                <TextField
                  label="Sebutkan dokumen lainnya"
                  value={d.dokumen_sumber_dana_lainnya}
                  onChange={(v) => set('dokumen_sumber_dana_lainnya', v)}
                  disabled={disabled}
                />
              )}
            </div>
          </div>

          {/* C. Sumber Kekayaan */}
          <div className="space-y-2">
            <CheckGroup
              label="C. Sumber Kekayaan"
              selected={d.sumber_kekayaan}
              onChange={(v) => set('sumber_kekayaan', v)}
              disabled={disabled}
              options={[
                { value: 'USAHA_PRIBADI', label: 'Usaha pribadi' },
                { value: 'WARISAN', label: 'Warisan' },
                { value: 'INVESTASI', label: 'Investasi' },
                { value: 'TABUNGAN', label: 'Tabungan jangka panjang' },
                { value: 'KEKAYAAN_LAINNYA', label: 'Lainnya' },
              ]}
            />
            {d.sumber_kekayaan.includes('KEKAYAAN_LAINNYA') && (
              <TextField
                label="Sebutkan sumber kekayaan lainnya"
                value={d.sumber_kekayaan_lainnya}
                onChange={(v) => set('sumber_kekayaan_lainnya', v)}
                disabled={disabled}
              />
            )}
            <div className="pl-4 border-l-2 border-slate-200 space-y-2">
              <CheckGroup
                label="Dokumen Pendukung Sumber Kekayaan"
                selected={d.dokumen_sumber_kekayaan}
                onChange={(v) => set('dokumen_sumber_kekayaan', v)}
                disabled={disabled}
                options={[
                  { value: 'LAPORAN_KEUANGAN', label: 'Laporan keuangan usaha' },
                  { value: 'DOK_KEPEMILIKAN_ASET', label: 'Dokumen kepemilikan aset' },
                  { value: 'BUKTI_KEPEMILIKAN_USAHA', label: 'Bukti kepemilikan usaha' },
                  { value: 'DOK_KEKAYAAN_LAINNYA', label: 'Lainnya' },
                ]}
              />
              {d.dokumen_sumber_kekayaan.includes('DOK_KEKAYAAN_LAINNYA') && (
                <TextField
                  label="Sebutkan dokumen lainnya"
                  value={d.dokumen_sumber_kekayaan_lainnya}
                  onChange={(v) => set('dokumen_sumber_kekayaan_lainnya', v)}
                  disabled={disabled}
                />
              )}
            </div>
          </div>
        </div>
      </AccSection>

      {/* IV. Beneficial Owner */}
      <AccSection title="IV. Beneficial Owner" index={3} open={isOpen(3)} onToggle={toggleSection}>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={d.bertindak_untuk_pihak_lain}
            onChange={(e) => set('bertindak_untuk_pihak_lain', e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300 accent-kesh-700"
          />
          <span className="font-medium text-slate-700">Pengguna jasa bertindak untuk pihak lain (ada Beneficial Owner)</span>
        </label>

        {d.bertindak_untuk_pihak_lain && (
          <div className="space-y-4 pl-6 border-l-2 border-slate-200">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Nama Beneficial Owner" value={d.nama_bo} onChange={(v) => set('nama_bo', v)} disabled={disabled} />
              <TextField label="Hubungan dengan Pengguna Jasa" value={d.hubungan_bo} onChange={(v) => set('hubungan_bo', v)} disabled={disabled} />
              <TextField label="Nomor Identitas BO" value={d.nomor_identitas_bo} onChange={(v) => set('nomor_identitas_bo', v)} disabled={disabled} />
              <TextField label="Alamat BO" value={d.alamat_bo} onChange={(v) => set('alamat_bo', v)} disabled={disabled} />
            </div>
            <TextAreaField
              label="Sumber Dana & Kekayaan BO"
              value={d.sumber_dana_kekayaan_bo}
              onChange={(v) => set('sumber_dana_kekayaan_bo', v)}
              disabled={disabled}
              rows={2}
            />
            <CheckGroup
              label="Dokumen Pendukung BO"
              selected={d.dokumen_bo}
              onChange={(v) => set('dokumen_bo', v)}
              disabled={disabled}
              options={[
                { value: 'IDENTITAS_BO', label: 'Dokumen identitas BO' },
                { value: 'NPWP_BO', label: 'NPWP BO (jika tersedia)' },
                { value: 'STRUKTUR_KEPEMILIKAN', label: 'Struktur kepemilikan' },
                { value: 'BUKTI_USAHA_BO', label: 'Bukti usaha / pendapatan BO' },
              ]}
            />
          </div>
        )}
      </AccSection>

      {/* V. Analisis Petugas */}
      <AccSection title="V. Analisis Petugas" index={4} open={isOpen(4)} onToggle={toggleSection}>
        <div className="space-y-5">
          <div className="space-y-2">
            <RadioGroup
              label="1. Konsistensi Data CDD & EDD"
              value={d.konsistensi_data}
              onChange={(v) => set('konsistensi_data', v)}
              disabled={disabled}
              options={[
                { value: 'KONSISTEN', label: 'Konsisten' },
                { value: 'TIDAK_KONSISTEN', label: 'Tidak konsisten' },
              ]}
            />
            {d.konsistensi_data === 'TIDAK_KONSISTEN' && (
              <TextAreaField
                label="Penjelasan ketidakkonsistenan"
                value={d.penjelasan_konsistensi}
                onChange={(v) => set('penjelasan_konsistensi', v)}
                disabled={disabled}
                rows={2}
              />
            )}
          </div>

          <div className="space-y-2">
            <RadioGroup
              label="2. Kewajaran Transaksi terhadap Profil Pengguna Jasa"
              value={d.kewajaran_transaksi}
              onChange={(v) => set('kewajaran_transaksi', v)}
              disabled={disabled}
              options={[
                { value: 'WAJAR', label: 'Wajar' },
                { value: 'TIDAK_WAJAR', label: 'Tidak wajar' },
              ]}
            />
            <TextAreaField
              label="Catatan"
              value={d.catatan_kewajaran}
              onChange={(v) => set('catatan_kewajaran', v)}
              disabled={disabled}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <RadioGroup
              label="3. Evaluasi Pekerjaan / Sumber Dana / Kekayaan"
              value={d.evaluasi_sumber_dana}
              onChange={(v) => set('evaluasi_sumber_dana', v)}
              disabled={disabled}
              options={[
                { value: 'MEMADAI', label: 'Memadai' },
                { value: 'TIDAK_MEMADAI', label: 'Tidak memadai' },
              ]}
            />
            <TextAreaField
              label="Penjelasan"
              value={d.penjelasan_evaluasi}
              onChange={(v) => set('penjelasan_evaluasi', v)}
              disabled={disabled}
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="4. Risiko Geografis"
              value={d.risiko_geografis}
              onChange={(v) => set('risiko_geografis', v)}
              disabled={disabled}
              options={[
                { value: 'RENDAH', label: 'Rendah' },
                { value: 'MENENGAH', label: 'Menengah' },
                { value: 'TINGGI', label: 'Tinggi' },
              ]}
            />
            <SelectField
              label="5. Risiko Produk / Layanan"
              value={d.risiko_produk}
              onChange={(v) => set('risiko_produk', v)}
              disabled={disabled}
              options={[
                { value: 'RENDAH', label: 'Rendah' },
                { value: 'MENENGAH', label: 'Menengah' },
                { value: 'TINGGI', label: 'Tinggi' },
              ]}
            />
            <SelectField
              label="6. Rangkuman Risiko Keseluruhan"
              value={d.rangkuman_risiko}
              onChange={(v) => set('rangkuman_risiko', v)}
              disabled={disabled}
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
              ]}
            />
          </div>

          <CheckGroup
            label="7. Rekomendasi Tindak Lanjut"
            selected={d.rekomendasi_tindak_lanjut}
            onChange={(v) => set('rekomendasi_tindak_lanjut', v)}
            disabled={disabled}
            options={[
              { value: 'LANJUTKAN', label: 'Melanjutkan hubungan usaha / transaksi' },
              { value: 'DOKUMEN_TAMBAHAN', label: 'Meminta dokumen tambahan' },
              { value: 'TUNDA', label: 'Menunda transaksi menunggu klarifikasi' },
              { value: 'TOLAK', label: 'Menolak transaksi' },
              { value: 'TUTUP', label: 'Menutup hubungan usaha' },
              { value: 'LTKM', label: 'Mengusulkan pelaporan sebagai LTKM' },
            ]}
          />
        </div>
      </AccSection>

      {/* VI. Hasil Keputusan */}
      <AccSection title="VI. Hasil Keputusan" index={5} open={isOpen(5)} onToggle={toggleSection}>
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">A. Keputusan Unit Kepatuhan</p>
            <SelectField
              label="Keputusan"
              value={d.keputusan_kepatuhan}
              onChange={(v) => set('keputusan_kepatuhan', v)}
              disabled={disabled}
              options={[
                { value: 'DISETUJUI', label: 'Disetujui' },
                { value: 'DITOLAK', label: 'Ditolak' },
                { value: 'DITUNDA', label: 'Ditunda' },
                { value: 'LTKM', label: 'Direkomendasikan untuk LTKM' },
              ]}
            />
            <TextAreaField
              label="Alasan Keputusan"
              value={d.alasan_keputusan_kepatuhan}
              onChange={(v) => set('alasan_keputusan_kepatuhan', v)}
              disabled={disabled}
              rows={2}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Nama Pejabat Unit Kepatuhan" value={d.nama_pejabat_kepatuhan} onChange={(v) => set('nama_pejabat_kepatuhan', v)} disabled={disabled} />
              <DateField label="Tanggal" value={d.tanggal_kepatuhan} onChange={(v) => set('tanggal_kepatuhan', v)} disabled={disabled} />
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">B. Keputusan Direktur / Final Approval</p>
            <SelectField
              label="Keputusan"
              value={d.keputusan_direktur}
              onChange={(v) => set('keputusan_direktur', v)}
              disabled={disabled}
              options={[
                { value: 'DISETUJUI', label: 'Disetujui' },
                { value: 'DITOLAK', label: 'Ditolak' },
                { value: 'TINDAKAN_TAMBAHAN', label: 'Perlu tindakan tambahan' },
                { value: 'LTKM', label: 'Direkomendasikan sebagai LTKM' },
              ]}
            />
            <TextAreaField
              label="Alasan Keputusan"
              value={d.alasan_keputusan_direktur}
              onChange={(v) => set('alasan_keputusan_direktur', v)}
              disabled={disabled}
              rows={2}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Nama Direktur" value={d.nama_direktur} onChange={(v) => set('nama_direktur', v)} disabled={disabled} />
              <DateField label="Tanggal" value={d.tanggal_direktur} onChange={(v) => set('tanggal_direktur', v)} disabled={disabled} />
            </div>
          </div>
        </div>
      </AccSection>

      {/* VII. Checklist Kelengkapan EDD */}
      <AccSection title="VII. Checklist Kelengkapan EDD" index={6} open={isOpen(6)} onToggle={toggleSection}>
        <CheckGroup
          selected={d.checklist_kelengkapan}
          onChange={(v) => set('checklist_kelengkapan', v)}
          disabled={disabled}
          options={[
            { value: 'FORM_CDD', label: 'Form CDD terisi lengkap' },
            { value: 'FORM_CDD_TAMBAHAN', label: 'Form CDD tambahan (jika ada)' },
            { value: 'FORM_EDD', label: 'Form EDD terisi lengkap' },
            { value: 'DOK_SUMBER_DANA', label: 'Dokumen sumber dana' },
            { value: 'DOK_SUMBER_KEKAYAAN', label: 'Dokumen sumber kekayaan (jika relevan)' },
            { value: 'DOK_BO', label: 'Dokumen Beneficial Owner (jika relevan)' },
            { value: 'HASIL_SCREENING', label: 'Hasil screening DTTOT / PPPSPM' },
            { value: 'NOTULEN_WAWANCARA', label: 'Notulen wawancara EDD (jika dilakukan)' },
            { value: 'FOTO_LOKASI', label: 'Foto lokasi usaha (jika diminta)' },
          ]}
        />
      </AccSection>

      {/* Action buttons */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => onSaveDraft(d)}
            disabled={saving}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Menyimpan…' : 'Simpan Draft EDD'}
          </button>
          <button
            type="button"
            onClick={() => onComplete(d)}
            disabled={saving || eddCompleted}
            className="rounded-md bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
          >
            {eddCompleted ? 'EDD Sudah Lengkap' : saving ? 'Menyimpan…' : 'Simpan & Lengkapi EDD'}
          </button>
        </div>
      )}
    </div>
  );
}
