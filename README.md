# 青空文庫 DuckDB Explorer

青空文庫のテキストデータをDuckDB-WASMを使用してブラウザ上で検索・分析するためのWebアプリケーションです。

## クイックスタート

```bash
pnpm install
pnpm dev
```

ブラウザで http://localhost:5173 を開きます。

## 機能

- SQLエディタによるクエリ実行
- 作品の全文検索
- 著者統計の表示
- 年別統計の表示
- テキスト内容の表示と分析

## 技術スタック

- [Vite](https://vitejs.dev/)
- [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview)
- [CodeMirror](https://codemirror.net/)

## 必要条件

- Node.js 18以上
- Python 3.8以上（データ変換用）
- pnpm

## 開発環境のセットアップ

```bash
# リポジトリのクローン
git clone https://github.com/r74tech/aozora-duckdb.git
cd aozora-duckdb

# 依存関係のインストール
pnpm install

# 開発サーバーの起動
pnpm dev
```

## データの準備

### 1. 青空文庫のデータをParquetに変換

[青空文庫の蔵書](http://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip)をダウンロードし、展開します。

必要なPythonパッケージをインストール：
```bash
pip install pandas duckdb
```

データ変換の実行：
```python
python tmp/aozora_data.py
```

### 2. Parquetファイルの分割

GitHub の容量制限（100MB）に対応するため、Parquetファイルを60MB以下に分割します：

```python
python tmp/chunk.py
```

分割されたファイルは `public` ディレクトリに配置します：
- aozora_combined_part00.parquet
- aozora_combined_part01.parquet
- ...など

## 使用方法

1. SQLエディタにクエリを入力
2. 「クエリ実行」ボタンをクリック
3. 結果がテーブル形式で表示されます

### サンプルクエリ

```sql
-- 基本的な作品情報の取得
SELECT
    作品ID,
    作品名,
    姓 || ' ' || 名 as 著者名,
    文字遣い種別,
    公開日
FROM aozora_combined
LIMIT 10;

-- テキスト内容の検索
SELECT
    作品名,
    姓 || ' ' || 名 as 著者名
FROM aozora_combined
WHERE テキスト内容 LIKE '%桜%'
LIMIT 5;
```

## ライセンス

Apache License 2.0

このプロジェクトには以下のソフトウェアが含まれています：
- duckdb wasm parquet @voluntas (https://github.com/voluntas/duckdb-wasm-parquet)

このプロジェクトは以下のデータを使用しています：
- 青空文庫のテキストデータ 各テキスト内容内の著作権表示に従う

```
Copyright 2024-2024, @r74tech

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

This product includes software developed by @voluntas (https://github.com/voluntas/duckdb-wasm-parquet).
Licensed under the Apache License, Version 2.0.
```