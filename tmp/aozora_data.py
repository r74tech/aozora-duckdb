import os
import re
import pandas as pd
import duckdb
from typing import Optional
import unicodedata

def remove_ruby(text: str) -> str:
    """ルビを削除する関数"""
    # 青空文庫形式のルビを削除
    # 例: ｜漢字《かんじ》 → 漢字
    text = re.sub(r'｜([^《]*)《[^》]*》', r'\1', text)
    # ルビだけの行を削除
    text = re.sub(r'《[^》]*》', '', text)
    # 残った｜を削除
    text = text.replace('｜', '')
    return text

def clean_text(text: Optional[str]) -> Optional[str]:
    """テキストをクリーンアップする関数"""
    if text is None:
        return None
    
    # Unicode正規化（NFKC）
    text = unicodedata.normalize('NFKC', text)
    
    # ルビの削除
    text = remove_ruby(text)
    
    # 制御文字の除去（改行は保持）
    text = ''.join(char for char in text if char == '\n' or unicodedata.category(char)[0] != 'C')
    
    # 青空文庫の注記（［＃...］）を削除
    text = re.sub(r'［＃[^］]*］', '', text)
    
    # 改行を統一
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    # 連続する空白や改行を1つに
    text = re.sub(r'\n\s*\n', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    
    # 前後の空白を削除
    text = text.strip()
    
    return text

def read_shiftjis_text_file(text_file_path: str) -> Optional[str]:
    """Shift-JISエンコードされたテキストファイルを読み取る関数"""
    if not os.path.exists(text_file_path):
        return None

    encodings = ['shift_jis', 'cp932', 'utf-8']
    
    for encoding in encodings:
        try:
            with open(text_file_path, "r", encoding=encoding) as file:
                content = file.read()
                return clean_text(content)
        except Exception as e:
            continue

    print(f"Error reading file {text_file_path}")
    return None

def convert_url_to_local_path(url: Optional[str]) -> Optional[str]:
    """URLをローカルパスに変換する関数"""
    if not isinstance(url, str):
        return None
    
    base_path = url.replace("https://www.aozora.gr.jp/cards/", "aozorabunko_text-master/cards/")
    base_path = base_path.replace(".zip", "")
    filename = os.path.basename(base_path) + ".txt"
    return os.path.join(base_path, filename)

def process_aozora_data(csv_file: str, output_parquet_file: str):
    """青空文庫のデータを処理してParquetファイルに保存する関数"""
    print("Reading CSV file...")
    df = pd.read_csv(csv_file)
    
    print("Converting URLs to local paths...")
    df["ローカルパス"] = df["テキストファイルURL"].apply(convert_url_to_local_path)
    
    # 欠落ファイルの確認
    missing_files = df[~df["ローカルパス"].apply(lambda path: os.path.exists(path) if path else False)]
    print(f"Missing files: {len(missing_files)}")
    missing_files.to_csv("missing_files.csv", index=False)
    
    print("Reading text contents...")
    total_files = len(df)
    df["テキスト内容"] = df["ローカルパス"].apply(
        lambda path: read_shiftjis_text_file(path) if path and os.path.exists(path) else None
    )
    
    # テキストの統計情報を表示
    text_stats = {
        "総ファイル数": total_files,
        "テキスト読み込み成功": df["テキスト内容"].notna().sum(),
        "テキスト読み込み失敗": df["テキスト内容"].isna().sum(),
    }
    print("\nText processing statistics:")
    for key, value in text_stats.items():
        print(f"{key}: {value}")
    
    # 不要なカラムを削除
    columns_to_exclude = [
        "XHTML/HTMLファイルURL", 
        "XHTML/HTMLファイル最終更新日",
        "XHTML/HTMLファイル符号化方式",
        "XHTML/HTMLファイル文字集合",
        "XHTML/HTMLファイル修正回数",
        "ローカルパス"
    ]
    df = df.drop(columns=[col for col in columns_to_exclude if col in df.columns])
    
    print("\nSaving to Parquet file...")
    # 直接Parquetファイルに保存
    df.to_parquet(output_parquet_file, compression='zstd')
    
    print(f"Parquet file saved: {output_parquet_file}")
    
    # ファイルサイズを確認
    file_size = os.path.getsize(output_parquet_file) / (1024 * 1024)  # MB単位
    print(f"Parquet file size: {file_size:.2f} MB")

if __name__ == "__main__":
    csv_file = "list_person_all_extended_utf8.csv"
    output_parquet_file = "aozora_combined.parquet"
    process_aozora_data(csv_file, output_parquet_file)