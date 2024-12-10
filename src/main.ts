/**
 * Copyright 2024 r74tech
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 * This code includes portions of duckdb wasm parquet
 * Original work Copyright 2024 @voluntas. Licensed under the Apache License, Version 2.0
 * https://github.com/voluntas/duckdb-wasm-parquet
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { sql } from '@codemirror/lang-sql'
import { EditorState } from '@codemirror/state'
import { panels, showPanel } from '@codemirror/view'
import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?worker'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import { EditorView, basicSetup } from 'codemirror'

let editor: EditorView

document.addEventListener('DOMContentLoaded', async () => {
  const opfsSupported = 'createWritable' in FileSystemFileHandle.prototype
  const opfsStatusElement = document.getElementById('opfs-status')
  if (opfsStatusElement) {
    opfsStatusElement.textContent = `OPFS: ${opfsSupported ? 'Supported' : 'Not supported'}`
  }

  const analyzeButton = document.getElementById('analyze') as HTMLButtonElement | null
  const authorStatsButton = document.getElementById('author-stats') as HTMLButtonElement | null
  const yearlyStatsButton = document.getElementById('yearly-stats') as HTMLButtonElement | null
  const searchInput = document.getElementById('search') as HTMLInputElement | null
  const clearButton = document.getElementById('clear') as HTMLButtonElement | null

  const DEFAULT_SQL = `SELECT
    作品ID,
    作品名,
    姓 || ' ' || 名 as 著者名,
    文字遣い種別,
    公開日,
    底本名1
  FROM aozora_combined
  ORDER BY 作品ID ASC
  LIMIT 10;`

  editor = new EditorView({
    state: EditorState.create({
      doc: DEFAULT_SQL,
      extensions: [
        sql(),
        basicSetup,
        EditorState.readOnly.of(false),
        EditorView.lineWrapping,
        showPanel.of((view) => {
          const dom = document.createElement('div')
          dom.style.cssText = `
            padding: 4px;
            display: flex;
            justify-content: flex-end;
            background: #f5f5f5;
            gap: 8px;
          `

          const runButton = document.createElement('button')
          runButton.textContent = 'クエリ実行'
          runButton.id = 'run'
          runButton.style.cssText = `
            padding: 5px 10px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          `
          runButton.addEventListener('click', async () => {
            const query = view.state.doc.toString()
            const conn = await db.connect()
            try {
              const result = await conn.query(query)
              displayResults(result)
            } catch (error) {
              console.error('Query execution error:', error)
              displayError(error)
            } finally {
              await conn.close()
            }
          })

          dom.appendChild(runButton)
          return { dom, bottom: true }
        }),
        EditorView.theme({
          '&': {
            height: '400px',
            maxWidth: '100%',
            position: 'relative',
            marginBottom: '20px',
          },
          '.cm-scroller': {
            overflow: 'auto',
          },
        }),
      ],
    }),
  })

  const editorElement = document.getElementById('editor')
  if (editorElement) {
    editorElement.appendChild(editor.dom)
  }

  // Initialize DuckDB
  const worker = new duckdb_worker()
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(duckdb_wasm)

  // 初期化時にボタンを無効化
  for (const button of [analyzeButton, authorStatsButton, yearlyStatsButton, clearButton, searchInput]) {
    if (button) button.disabled = true
  }

  // Editor.domも無効化
  editor.dom.style.pointerEvents = 'none'

  // Set up search functionality
  if (searchInput) {
    searchInput.addEventListener('input', async () => {
      const searchTerm = searchInput.value.trim()
      if (!searchTerm) {
        const resultElement = document.getElementById('result')
        if (resultElement) resultElement.innerHTML = ''
        return
      }

      const conn = await db.connect()
      try {
        const result = await conn.query(`
          SELECT 作品名, 姓 || ' ' || 名 as 著者名, 公開日
          FROM aozora_combined
          WHERE 作品名 LIKE '%${searchTerm}%'
             OR 姓 LIKE '%${searchTerm}%'
             OR 名 LIKE '%${searchTerm}%'
          LIMIT 100;
        `)
        displayResults(result)
      } catch (error) {
        console.error('Search error:', error)
        displayError(error)
      } finally {
        await conn.close()
      }
    })
  }

  // 著者統計ボタンの設定
  document.getElementById('author-stats')?.addEventListener('click', async () => {
    const conn = await db.connect()
    try {
      const result = await conn.query(`
        SELECT 
          姓 || ' ' || 名 as 著者名,
          COUNT(*) as 作品数,
          MIN(公開日) as 最初の公開日,
          MAX(公開日) as 最新の公開日
        FROM aozora_combined
        GROUP BY 姓, 名
        ORDER BY 作品数 DESC
        LIMIT 20;
      `)
      displayResults(result)
    } catch (error) {
      console.error('Author stats error:', error)
      displayError(error)
    } finally {
      await conn.close()
    }
  })

  // 年別統計ボタンの設定
  document.getElementById('yearly-stats')?.addEventListener('click', async () => {
    const conn = await db.connect()
    try {
      const result = await conn.query(`
        SELECT 
          SUBSTR(公開日, 1, 4) as 年,
          COUNT(*) as 公開作品数
        FROM aozora_combined
        GROUP BY SUBSTR(公開日, 1, 4)
        ORDER BY 年 DESC;
      `)
      displayResults(result)
    } catch (error) {
      console.error('Yearly stats error:', error)
      displayError(error)
    } finally {
      await conn.close()
    }
  })

  // クリアボタンの設定
  document.getElementById('clear')?.addEventListener('click', async () => {
    const resultElement = document.getElementById('result')
    if (resultElement) {
      resultElement.innerHTML = ''
    }
  })

  // OPFSのデータを削除
  document.getElementById('clear-opfs')?.addEventListener('click', async () => {
    try {
      await clearAllPartsFromOPFS()
    } catch (error) {
      console.error('Error clearing OPFS:', error)
    }
  })

  // Load Parquet file
  try {
    await loadParquetParts(db)

    // ボタンを有効化
    for (const button of [analyzeButton, authorStatsButton, yearlyStatsButton, clearButton, searchInput]) {
      if (button) button.disabled = false
    }

    // Editor.domを有効化
    editor.dom.style.pointerEvents = 'auto'

  } catch (error) {
    console.error('Failed to load Parquet files:', error)
    displayError(error)
  }
})

// Helper functions
function displayResults(result: duckdb.AsyncQueryResult) {
  const resultElement = document.getElementById('result')
  if (!resultElement) return

  const table = document.createElement('table')
  const rows = result.toArray()

  if (rows.length > 0) {
    try {
      // ProxyオブジェクトからデータのキーをSymbol.iteratorで取得
      const firstRow = rows[0]
      const headers = [...firstRow].map(([key]) => key)

      const headerRow = document.createElement('tr')
      headerRow.innerHTML = headers.map((header) => `<th>${header}</th>`).join('')
      table.appendChild(headerRow)

      // 各行のデータを処理
      for (const row of rows) {
        const tr = document.createElement('tr')
        tr.innerHTML = headers.map((header) => {
          // Symbol.iteratorで取得したキーを使って値を取得
          const cellValue = [...row].find(([key]) => key === header)?.[1]

          const cellContent = typeof cellValue === 'string'
            ? cellValue
              .replace(/\n/g, '\n')
              // HTMLエスケープ
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;')
            : (cellValue === null ? '' : String(cellValue));

          // テキスト内容の場合、スクロール可能なセルにする
          const isTextContent = header === 'テキスト内容';
          const tdClass = isTextContent ? ' class="text-content"' : '';
          return `<td${tdClass}>${cellContent}</td>`;
        }).join('')
        table.appendChild(tr)
      }

      resultElement.innerHTML = ''
      resultElement.appendChild(table)
    } catch (error) {
      console.error('Detailed Error:', {
        error,
        errorMessage: error.message,
        errorStack: error.stack
      })
      displayError(new Error(`テキストの処理中にエラーが発生しました: ${error.message}`))
    }
  } else {
    console.debug('No rows returned from query')
  }
}

function displayError(error: any) {
  const resultElement = document.getElementById('result')
  if (!resultElement) return

  resultElement.innerHTML = `
    <div class="error">
      エラーが発生しました: ${error.message || error}
    </div>
  `
}

// OPFS related functions
const FILE_NAME_PREFIX = 'aozora_combined_part'

// Function to get buffer from OPFS
const getBufferFromOPFS = async (partIndex: number): Promise<ArrayBuffer | null> => {
  if ('createWritable' in FileSystemFileHandle.prototype) {
    try {
      const root = await navigator.storage.getDirectory()
      const fileName = `${FILE_NAME_PREFIX}${partIndex.toString().padStart(2, '0')}.parquet`
      const fileHandle = await root.getFileHandle(fileName, { create: false })
      if (fileHandle) {
        const file = await fileHandle.getFile()
        return await file.arrayBuffer()
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return null
      }
      console.error('Error reading file from OPFS:', error)
    }
  } else {
    console.warn('createWritable is not supported. Data will not be saved to OPFS.')
  }
  return null
}

// Function to save stream to OPFS
const saveStreamToOPFS = async (stream: ReadableStream, partIndex: number): Promise<void> => {
  if ('createWritable' in FileSystemFileHandle.prototype) {
    try {
      const root = await navigator.storage.getDirectory()
      const fileName = `${FILE_NAME_PREFIX}${partIndex.toString().padStart(2, '0')}.parquet`
      const fileHandle = await root.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await stream.pipeTo(writable)
      console.debug(`Saved part ${partIndex} to OPFS`)
    } catch (error) {
      console.error('Error occurred while saving file to OPFS:', error)
      throw error
    }
  } else {
    console.warn('createWritable is not supported. Data will not be saved to OPFS.')
  }
}

// Function to delete buffer from OPFS
const deleteBufferFromOPFS = async (partIndex: number): Promise<void> => {
  try {
    const root = await navigator.storage.getDirectory()
    const fileName = `${FILE_NAME_PREFIX}${partIndex.toString().padStart(2, '0')}.parquet`
    await root.removeEntry(fileName)
  } catch (error) {
    console.error('Error deleting file from OPFS:', error)
    throw error
  }
}

// Modified loadParquetParts function to use OPFS
async function loadParquetParts(db: duckdb.AsyncDuckDB): Promise<void> {
  const baseUrl = import.meta.env.BASE_URL || '/'
  const totalParts = 6

  try {
    const conn = await db.connect()

    for (let i = 0; i < totalParts; i++) {
      let buffer = await getBufferFromOPFS(i)

      // If not in OPFS, fetch and save
      if (!buffer) {
        const partUrl = new URL(
          `${FILE_NAME_PREFIX}${i.toString().padStart(2, '0')}.parquet`,
          window.location.origin + baseUrl
        ).href

        console.debug(`Fetching part ${i} from:`, partUrl)
        const response = await fetch(partUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch part ${i}: ${response.statusText}`)
        }

        if (!response.body) {
          throw new Error('Response body is null')
        }

        // Save to OPFS
        await saveStreamToOPFS(response.body, i)

        // Get the saved buffer
        buffer = await getBufferFromOPFS(i)
        if (!buffer) {
          throw new Error(`Failed to retrieve buffer from OPFS for part ${i}`)
        }
      }

      console.debug(`Processing part ${i}:`, buffer.byteLength)
      await db.registerFileBuffer(`part${i}.parquet`, new Uint8Array(buffer))

      if (i === 0) {
        await conn.query(`
          CREATE TABLE aozora_combined AS 
          SELECT * FROM read_parquet('part0.parquet');
        `)
      } else {
        await conn.query(`
          INSERT INTO aozora_combined 
          SELECT * FROM read_parquet('part${i}.parquet');
        `)
      }
    }

    const result = await conn.query(`
      SELECT COUNT(*) as total_rows 
      FROM aozora_combined;
    `)
    console.debug('Total rows loaded:', result.toArray()[0].total_rows)

    await conn.close()
  } catch (error) {
    console.error('Error loading Parquet files:', error)
    throw error
  }
}

// Clear function to remove all parts from OPFS
async function clearAllPartsFromOPFS(): Promise<void> {
  const totalParts = 6
  for (let i = 0; i < totalParts; i++) {
    try {
      await deleteBufferFromOPFS(i)
      console.debug(`Deleted part ${i} from OPFS`)
    } catch (error) {
      console.error(`Error deleting part ${i} from OPFS:`, error)
    }
  }
}