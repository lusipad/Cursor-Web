#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
提取Cursor中的真实项目路径
"""

import sqlite3
import json
import os
import sys
from pathlib import Path
from collections import Counter

class RealPathExtractor:
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
    
    def extract_real_paths_from_bubbles(self):
        """从聊天气泡中提取真实路径"""
        global_db_path = self.cursor_path / 'User' / 'globalStorage' / 'state.vscdb'
        
        if not global_db_path.exists():
            print(f"❌ 全局数据库文件不存在: {global_db_path}")
            return {}
        
        print(f"📂 分析全局数据库...")
        
        try:
            conn = sqlite3.connect(str(global_db_path))
            cursor = conn.cursor()
            
            # 获取所有bubble数据
            cursor.execute("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'")
            bubbles = cursor.fetchall()
            
            conn.close()
            
            print(f"📦 分析 {len(bubbles)} 个气泡...")
            
            # 统计所有路径
            all_paths = []
            conversation_paths = {}  # conversationId -> 路径列表
            
            for bubble in bubbles:
                try:
                    key = bubble[0]
                    value = bubble[1]
                    
                    if not value:
                        continue
                    
                    # 解析conversation ID
                    parts = key.split(':')
                    if len(parts) < 3:
                        continue
                    conversation_id = parts[1]
                    
                    bubble_data = json.loads(value)
                    
                    # 提取路径信息
                    paths = self.extract_paths_from_bubble(bubble_data)
                    
                    if paths:
                        all_paths.extend(paths)
                        if conversation_id not in conversation_paths:
                            conversation_paths[conversation_id] = []
                        conversation_paths[conversation_id].extend(paths)
                        
                except Exception as error:
                    continue
            
            # 分析路径统计
            print(f"\n📊 路径统计:")
            path_counter = Counter(all_paths)
            print(f"  总共找到 {len(all_paths)} 个路径引用")
            print(f"  唯一路径数: {len(path_counter)}")
            
            print(f"\n🔥 最常用的路径:")
            for path, count in path_counter.most_common(15):
                print(f"  {path} (使用 {count} 次)")
            
            # 为每个conversation分配最可能的路径
            conversation_projects = {}
            for conv_id, paths in conversation_paths.items():
                if paths:
                    # 选择该会话中最常用的路径
                    path_counter = Counter(paths)
                    most_common_path = path_counter.most_common(1)[0][0]
                    project_name = self.extract_project_name_from_path(most_common_path)
                    
                    conversation_projects[conv_id] = {
                        'name': project_name,
                        'rootPath': most_common_path,
                        'fileCount': len(set(paths))
                    }
            
            print(f"\n📁 成功匹配 {len(conversation_projects)} 个会话到真实项目")
            
            return conversation_projects
            
        except Exception as error:
            print(f"❌ 提取失败: {error}")
            import traceback
            traceback.print_exc()
            return {}
    
    def extract_paths_from_bubble(self, bubble_data):
        """从bubble数据中提取路径"""
        paths = []
        
        # 检查各种可能包含路径的字段
        path_fields = [
            'attachedFolders',
            'attachedFoldersNew', 
            'relevantFiles',
            'attachedCodeChunks',
            'recentlyViewedFiles',
            'context'
        ]
        
        for field in path_fields:
            if field in bubble_data:
                field_data = bubble_data[field]
                extracted = self.extract_paths_from_field(field_data)
                paths.extend(extracted)
        
        # 清理和标准化路径
        cleaned_paths = []
        for path in paths:
            clean_path = self.clean_path(path)
            if clean_path and len(clean_path) > 10:  # 过滤太短的路径
                cleaned_paths.append(clean_path)
        
        return list(set(cleaned_paths))  # 去重
    
    def extract_paths_from_field(self, field_data):
        """从字段数据中递归提取路径"""
        paths = []
        
        if isinstance(field_data, list):
            for item in field_data:
                paths.extend(self.extract_paths_from_field(item))
        elif isinstance(field_data, dict):
            for key, value in field_data.items():
                if isinstance(value, str):
                    # 检查是否是路径
                    if self.looks_like_path(value):
                        paths.append(value)
                else:
                    paths.extend(self.extract_paths_from_field(value))
        elif isinstance(field_data, str):
            if self.looks_like_path(field_data):
                paths.append(field_data)
        
        return paths
    
    def looks_like_path(self, text):
        """判断字符串是否像路径"""
        if not isinstance(text, str) or len(text) < 5:
            return False
        
        # 常见路径特征
        path_indicators = [
            'file:///',
            'C:\\',
            'D:\\',
            '/home/',
            '/Users/',
            '.git',
            'package.json',
            'node_modules',
            '.vscode'
        ]
        
        for indicator in path_indicators:
            if indicator in text:
                return True
        
        # 检查是否包含路径分隔符和常见扩展名
        if ('\\' in text or '/' in text) and any(ext in text for ext in ['.js', '.ts', '.py', '.json', '.md', '.txt', '.html', '.css']):
            return True
        
        return False
    
    def clean_path(self, path_str):
        """清理路径字符串"""
        if not path_str:
            return None
        
        # 处理file://协议
        if path_str.startswith('file:///'):
            path_str = path_str[8:]  # 移除 file:///
            if os.name == 'nt':  # Windows
                path_str = path_str.replace('/', '\\')
        
        # URL解码
        try:
            import urllib.parse
            path_str = urllib.parse.unquote(path_str)
        except:
            pass
        
        # 提取根目录
        if os.name == 'nt':  # Windows
            # 查找项目根目录（通常包含package.json, .git等）
            parts = path_str.split('\\')
        else:
            parts = path_str.split('/')
        
        # 尝试找到项目根目录
        for i in range(len(parts) - 1, 0, -1):
            potential_root = ('\\' if os.name == 'nt' else '/').join(parts[:i+1])
            # 如果路径看起来像项目根目录，返回它
            if any(indicator in parts[i].lower() for indicator in ['project', 'repo', 'src', 'app']):
                return potential_root
        
        # 如果没找到明显的项目根，返回倒数第二级目录
        if len(parts) >= 2:
            return ('\\' if os.name == 'nt' else '/').join(parts[:-1])
        
        return path_str
    
    def extract_project_name_from_path(self, path_str):
        """从路径提取项目名称"""
        if not path_str:
            return 'Unknown Project'
        
        try:
            path_obj = Path(path_str)
            return path_obj.name
        except:
            # 手动处理
            path_str = path_str.replace('\\', '/').rstrip('/')
            parts = path_str.split('/')
            return parts[-1] if parts else 'Unknown Project'

def main():
    extractor = RealPathExtractor()
    projects = extractor.extract_real_paths_from_bubbles()
    
    if projects:
        print(f"\n💾 保存项目映射...")
        with open('real_project_mapping.json', 'w', encoding='utf-8') as f:
            json.dump(projects, f, ensure_ascii=False, indent=2)
        
        print(f"✅ 项目映射已保存到 real_project_mapping.json")
        print(f"📊 映射了 {len(projects)} 个会话到真实项目")
    else:
        print("❌ 未找到真实项目路径")

if __name__ == "__main__":
    main()