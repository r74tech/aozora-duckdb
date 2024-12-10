import os
import duckdb
import pandas as pd
from typing import List, Tuple
import math

def get_chunk_sizes(total_size: int, target_chunk_size: int = 60 * 1024 * 1024) -> List[int]:
    """
    総サイズから適切なチャンクサイズを計算する
    """
    num_chunks = math.ceil(total_size / target_chunk_size)
    base_chunk_size = total_size // num_chunks
    chunk_sizes = []
    
    remaining_size = total_size
    for i in range(num_chunks - 1):
        chunk_sizes.append(base_chunk_size)
        remaining_size -= base_chunk_size
    chunk_sizes.append(remaining_size)
    
    return chunk_sizes

def split_parquet_file(input_file: str, output_dir: str = "splits", target_size_mb: int = 60):
    """
    Parquetファイルを指定サイズごとに分割する
    """
    # 出力ディレクトリの作成
    os.makedirs(output_dir, exist_ok=True)
    
    # DuckDBに接続
    con = duckdb.connect()
    
    # 入力ファイルのサイズを確認
    total_size = os.path.getsize(input_file)
    print(f"Input file size: {total_size / (1024*1024):.2f} MB")
    
    # テーブルの総行数を取得
    con.execute(f"CREATE VIEW input_data AS SELECT * FROM read_parquet('{input_file}')")
    total_rows = con.execute("SELECT COUNT(*) FROM input_data").fetchone()[0]
    print(f"Total rows: {total_rows}")
    
    # チャンクサイズの計算
    chunk_sizes = get_chunk_sizes(total_size, target_size_mb * 1024 * 1024)
    rows_per_chunk = total_rows // len(chunk_sizes)
    
    # 分割して保存
    for i in range(len(chunk_sizes)):
        start_row = i * rows_per_chunk
        end_row = (i + 1) * rows_per_chunk if i < len(chunk_sizes) - 1 else total_rows
        
        output_file = os.path.join(output_dir, f'aozora_combined_part{i:02d}.parquet')
        
        query = f"""
        COPY (
            SELECT *
            FROM input_data
            LIMIT {end_row - start_row}
            OFFSET {start_row}
        ) TO '{output_file}' (FORMAT 'parquet', COMPRESSION 'zstd');
        """
        
        print(f"\nProcessing part {i+1}/{len(chunk_sizes)}")
        print(f"Rows {start_row} to {end_row}")
        try:
            con.execute(query)
            file_size = os.path.getsize(output_file) / (1024 * 1024)
            print(f"Saved {output_file}: {file_size:.2f} MB")
        except Exception as e:
            print(f"Error saving part {i}: {e}")
    
    # 検証用のクエリを生成
    verification_query = "CREATE VIEW combined AS\n"
    verification_query += " UNION ALL ".join([
        f"SELECT * FROM read_parquet('{os.path.join(output_dir, f'aozora_combined_part{i:02d}.parquet')}')"
        for i in range(len(chunk_sizes))
    ])
    
    print("\nVerification query:")
    print(verification_query)
    
    # 検証の実行
    try:
        con.execute(verification_query)
        original_count = con.execute("SELECT COUNT(*) FROM input_data").fetchone()[0]
        split_count = con.execute("SELECT COUNT(*) FROM combined").fetchone()[0]
        print(f"\nVerification results:")
        print(f"Original rows: {original_count}")
        print(f"Split rows: {split_count}")
        print(f"Match: {original_count == split_count}")
    except Exception as e:
        print(f"Verification error: {e}")
    
    con.close()

if __name__ == "__main__":
    input_file = "aozora_combined.parquet"
    split_parquet_file(input_file)