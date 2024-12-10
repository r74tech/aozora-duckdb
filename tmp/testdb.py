import duckdb

# DuckDBにメモリ内接続
con = duckdb.connect()

# Parquetファイルを仮想テーブルとして読み込む
con.execute("""
CREATE VIEW aozora_combined AS
SELECT * FROM read_parquet('aozora-search/public/aozora_combined.parquet')
""")

# テーブルのカラム名を取得
columns = con.execute("PRAGMA table_info('aozora_combined')").fetchall()
columns = [col[1] for col in columns]  # カラム名だけ取得

# 各カラムのTRY_CASTを生成して実行
for column in columns:
    query = f"""
    SELECT
        {column},
        TRY_CAST({column} AS JSON) AS {column}_json
    FROM
        aozora_combined
    LIMIT 1;
    """
    print(f"Checking column: {column}")
    try:
        result = con.execute(query).fetchall()
        print(result)
    except Exception as e:
        print(f"Error in column {column}: {e}")
