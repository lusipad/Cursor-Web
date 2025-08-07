#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
调试Cursor数据结构
"""

import sqlite3
import json
import os
import sys
from pathlib import Path

class CursorDataDebugger:
    def __init__(self):
        self.cursor_path = self.get_cursor_path()
        print(f"📁 Cursor存储路径: {self.cursor_path}")
        
    def get_cursor_path(self):
        """获取Cursor存储路径"""
        home = Path.home()
        if os.name == 'nt':  # Windows
            return home / 'AppData' / 'Roaming' / 'Cursor'
        elif sys.platform == 'darwin':  # macOS
            return home / 'Library' / 'Application Support' / 'Cursor'
        else:  # Linux
            return home / '.config' / 'Cursor'
    
    def debug_global_database(self):
        """调试全局数据库"""
        global_db_path = self.cursor_path / 'User' / 'globalStorage' / 'state.vscdb'
        
        if not global_db_path.exists():
            print(f"❌ 全局数据库文件不存在: {global_db_path}")
            return
        
        print(f"📂 全局数据库路径: {global_db_path}")
        print(f"📊 数据库文件大小: {global_db_path.stat().st_size / 1024 / 1024:.1f} MB")
        
        try:
            conn = sqlite3.connect(str(global_db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # 检查表结构
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            print(f"📋 找到表: {', '.join(tables)}")
            
            # 检查cursorDiskKV表结构
            if 'cursorDiskKV' in tables:
                cursor.execute("PRAGMA table_info(cursorDiskKV)")
                columns = cursor.fetchall()
                print(f"📝 cursorDiskKV表结构:")
                for col in columns:
                    print(f"  - {col[1]} ({col[2]})")
                
                # 查看bubbleId相关的keys
                cursor.execute("SELECT key FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' LIMIT 10")
                bubble_keys = [row[0] for row in cursor.fetchall()]
                print(f"🔑 前10个bubble keys:")
                for key in bubble_keys:
                    print(f"  - {key}")
                
                # 查看第一个bubble的完整数据
                cursor.execute("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' LIMIT 1")
                result = cursor.fetchone()
                if result:
                    print(f"\n📄 第一个bubble数据:")
                    print(f"Key: {result[0]}")
                    print(f"Value length: {len(result[1]) if result[1] else 0}")
                    if result[1]:
                        try:
                            data = json.loads(result[1])
                            print(f"JSON keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
                            print(f"Sample data: {str(data)[:500]}...")
                        except Exception as e:
                            print(f"JSON解析失败: {e}")
                            print(f"Raw value: {result[1][:200]}...")
                
                # 查看所有不同的key前缀
                cursor.execute("SELECT DISTINCT substr(key, 1, 20) as prefix, COUNT(*) as count FROM cursorDiskKV GROUP BY prefix ORDER BY count DESC LIMIT 20")
                prefixes = cursor.fetchall()
                print(f"\n🏷️ Top 20 key前缀:")
                for prefix, count in prefixes:
                    print(f"  {prefix}... : {count}")
                
                # 查看是否有其他相关的key
                cursor.execute("SELECT key, LENGTH(value) as value_length FROM cursorDiskKV WHERE key LIKE '%conversation%' OR key LIKE '%chat%' OR key LIKE '%message%' LIMIT 10")
                chat_keys = cursor.fetchall()
                if chat_keys:
                    print(f"\n💬 聊天相关的keys:")
                    for key, length in chat_keys:
                        print(f"  {key} (长度: {length})")
            
            conn.close()
            
        except Exception as error:
            print(f"❌ 数据库访问失败: {error}")
            import traceback
            traceback.print_exc()

def main():
    debugger = CursorDataDebugger()
    debugger.debug_global_database()

if __name__ == "__main__":
    main()