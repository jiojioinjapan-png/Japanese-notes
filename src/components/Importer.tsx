import { useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileJson,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-react';
import {
  categories,
  exampleImport,
  NOTE_TYPES,
  validateImport,
  ValidationError,
  type NoteInput,
} from '../../shared/notes';
import { responseBody } from '../api';
import Modal from './Modal';
import NoteContent from './NoteContent';

export default function Importer({
  close,
  onImported,
}: {
  close: () => void;
  onImported: (message: string) => void;
}) {
  const [code, setCode] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [preview, setPreview] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const validation = useMemo((): { notes: NoteInput[]; error: string } => {
    if (!code.trim()) return { notes: [], error: '' };
    if (new TextEncoder().encode(code).byteLength > 1024 * 1024)
      return { notes: [], error: 'JSON 超过 1 MiB，请分批导入。' };
    try {
      return { notes: validateImport(JSON.parse(code)), error: '' };
    } catch (cause) {
      return {
        notes: [],
        error:
          cause instanceof ValidationError
            ? cause.issues[0]
            : 'JSON 无法解析，请检查双引号、逗号和括号。',
      };
    }
  }, [code]);
  function updateCode(value: string) {
    setCode(value);
    setError('');
    setResult(null);
    setPreview(0);
  }
  async function loadFile(file?: File) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('文件超过 1 MiB，请分批导入。');
      return;
    }
    try {
      updateCode(await file.text());
    } catch {
      setError('无法读取文件，请重新选择。');
    }
  }
  async function upload() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/notes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: validation.notes }),
      });
      const body = await responseBody<{ inserted: number; skipped: number }>(response);
      setResult(body);
      onImported(
        `已新增 ${body.inserted} 条笔记${body.skipped ? `，跳过 ${body.skipped} 条重复笔记` : ''}。`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '上传失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }
  const current = validation.notes[preview];
  return (
    <Modal
      title="批量导入笔记"
      close={() => {
        if (!busy) close();
      }}
      className="import-modal"
    >
      <header className="import-header">
        <span className="modal-symbol">
          <ArrowDownToLine size={22} />
        </span>
        <div>
          <h2 tabIndex={-1} data-dialog-focus>
            把新发现，收进书库。
          </h2>
          <p>{step === 1 ? '01 · 输入笔记' : '02 · 预览与上传'}</p>
        </div>
        <button className="icon-button" aria-label="关闭导入" onClick={close} disabled={busy}>
          <X size={21} />
        </button>
      </header>
      {result ? (
        <div className="import-result">
          <span className="import-result-check">
            <Check size={34} />
          </span>
          <h3>新的一页，已收藏。</h3>
          <p role="status">
            导入完成，新增 {result.inserted} 条，跳过 {result.skipped} 条重复笔记。
          </p>
        </div>
      ) : step === 1 ? (
        <div className="import-editor">
          <div className="import-tools">
            <label htmlFor="json-input">
              笔记内容 <span>JSON</span>
            </label>
            <div>
              <button
                className="text-button"
                onClick={() => updateCode(JSON.stringify(exampleImport, null, 2))}
              >
                填入示例
              </button>
              <button className="text-button" onClick={() => fileRef.current?.click()}>
                <FileJson size={16} /> 选择文件
              </button>
            </div>
          </div>
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void loadFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <textarea
            id="json-input"
            spellCheck={false}
            value={code}
            placeholder={
              '{\n  "notes": [\n    {\n      "type": "word",\n      "term": "多彩",\n      "reading": "たさい",\n      "accent": 0,\n      "partOfSpeech": "形动",\n      "meaning": "丰富多彩"\n    }\n  ]\n}'
            }
            onChange={(event) => updateCode(event.target.value)}
          />
          {validation.error ? (
            <p className="validation-error" role="status">
              {validation.error}
            </p>
          ) : validation.notes.length ? (
            <p className="import-valid" role="status">
              <Check size={16} /> {validation.notes.length} 条笔记通过检查
            </p>
          ) : (
            <p className="import-hint">粘贴 JSON 或选择文件；每批最多 500 条、1 MiB。</p>
          )}
        </div>
      ) : (
        <div className="import-review">
          <p className="import-counts">
            {NOTE_TYPES.map(
              (type) =>
                `${categories[type].label} ${validation.notes.filter((note) => note.type === type).length}`,
            ).join(' · ')}
          </p>
          <div className="import-note-preview">
            {current && (
              <article key={preview} className={`preview-note ${current.type}`}>
                <NoteContent note={{ ...current, id: 'preview', createdAt: '' }} full />
              </article>
            )}
          </div>
          <div className="preview-pagination">
            <button
              className="icon-button"
              aria-label="预览上一条"
              disabled={preview === 0 || busy}
              onClick={() => setPreview(preview - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <span>
              预览 {preview + 1} / {validation.notes.length}
            </span>
            <button
              className="icon-button"
              aria-label="预览下一条"
              disabled={preview === validation.notes.length - 1 || busy}
              onClick={() => setPreview(preview + 1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="validation-error" role="alert">
          {error.split('\n')[0]}
        </p>
      )}
      <footer className="import-footer">
        {result ? (
          <>
            <span>已保存在你的笔记库中。</span>
            <button className="primary-button" onClick={close}>
              返回书库 <ArrowRight size={17} />
            </button>
          </>
        ) : step === 1 ? (
          <>
            <a
              className="text-button"
              href="https://github.com/jiojioinjapan-png/Japanese-notes#json-导入格式"
              target="_blank"
              rel="noreferrer"
            >
              JSON 格式说明
            </a>
            <button
              className="primary-button"
              disabled={!validation.notes.length}
              onClick={() => setStep(2)}
            >
              预览笔记 <ArrowRight size={17} />
            </button>
          </>
        ) : (
          <>
            <button className="text-button" disabled={busy} onClick={() => setStep(1)}>
              <ArrowLeft size={17} /> 返回编辑
            </button>
            <button className="primary-button" disabled={busy} onClick={() => void upload()}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}
              {busy ? '正在上传…' : '上传笔记'}
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}
