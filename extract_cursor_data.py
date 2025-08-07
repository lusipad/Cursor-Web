#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cursor聊天数据提取脚本 - Python版本
"""

import sqlite3
import json
import os
import sys
from pathlib import Path
import hashlib
from datetime import datetime
import re

class CursorDataExtractor:
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
    
    def extract_chat_messages_from_global(self):
        """从全局数据库提取聊天消息"""
        global_db_path = self.cursor_path / 'User' / 'globalStorage' / 'state.vscdb'
        
        if not global_db_path.exists():
            print(f"❌ 全局数据库文件不存在: {global_db_path}")
            return []
        
        print(f"📂 全局数据库路径: {global_db_path}")
        print(f"📊 数据库文件大小: {global_db_path.stat().st_size / 1024 / 1024:.1f} MB")
        
        try:
            # 连接数据库
            conn = sqlite3.connect(str(global_db_path))
            conn.row_factory = sqlite3.Row  # 返回字典格式
            cursor = conn.cursor()
            
            # 检查表结构
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            print(f"📋 找到表: {', '.join(tables)}")
            
            if 'cursorDiskKV' not in tables:
                print("❌ 未找到cursorDiskKV表")
                return []
            
            # 查询聊天气泡数量
            cursor.execute("SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'")
            bubble_count = cursor.fetchone()[0]
            print(f"💬 找到 {bubble_count} 个聊天气泡")
            
            if bubble_count == 0:
                print("⚠️ 没有找到聊天气泡数据")
                return []
            
            # 获取所有聊天气泡
            cursor.execute("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'")
            bubbles = cursor.fetchall()
            
            conn.close()
            
            print(f"📦 成功获取 {len(bubbles)} 个气泡")
            
            # 分组为会话
            sessions = self.group_into_sessions(bubbles)
            print(f"📚 最终提取到 {len(sessions)} 个会话")
            
            return sessions
            
        except Exception as error:
            print(f"❌ 数据库访问失败: {error}")
            return []
    
    def group_into_sessions(self, bubbles):
        """将气泡分组为会话"""
        print(f"🔄 开始分组 {len(bubbles)} 个气泡...")
        
        session_groups = {}
        parsed_count = 0
        error_count = 0
        
        for bubble in bubbles:
            try:
                key = bubble['key'] if isinstance(bubble, dict) else bubble[0]
                value = bubble['value'] if isinstance(bubble, dict) else bubble[1]
                
                bubble_data = json.loads(value)
                parsed_count += 1
                
                if not bubble_data or 'conversationId' not in bubble_data:
                    continue
                
                conversation_id = bubble_data['conversationId']
                
                if conversation_id not in session_groups:
                    session_groups[conversation_id] = []
                
                session_groups[conversation_id].append(bubble_data)
                
            except Exception as error:
                error_count += 1
                if error_count <= 5:  # 只显示前5个错误
                    print(f"⚠️ 解析气泡数据失败: {error}")
        
        print(f"📊 解析统计: 成功 {parsed_count}, 失败 {error_count}")
        print(f"📝 找到 {len(session_groups)} 个不同的会话")
        
        sessions = []
        for conversation_id, session_bubbles in session_groups.items():
            if not session_bubbles:
                continue
            
            # 按时间排序
            session_bubbles.sort(key=lambda x: x.get('cTime', x.get('timestamp', 0)))
            
            messages = []
            for bubble in session_bubbles:
                if bubble.get('type') == 'user':
                    messages.append({
                        'role': 'user',
                        'content': bubble.get('text', ''),
                        'timestamp': bubble.get('cTime', bubble.get('timestamp'))
                    })
                elif bubble.get('type') == 'assistant':
                    messages.append({
                        'role': 'assistant', 
                        'content': bubble.get('text', ''),
                        'timestamp': bubble.get('cTime', bubble.get('timestamp'))
                    })
            
            if messages:
                sessions.append({
                    'sessionId': conversation_id,
                    'messages': messages,
                    'timestamp': session_bubbles[0].get('cTime', session_bubbles[0].get('timestamp', datetime.now().isoformat()))
                })
        
        print(f"✅ 成功创建 {len(sessions)} 个有效会话")
        return sessions
    
    def extract_workspace_projects(self):
        """提取工作区项目信息"""
        workspace_storage_path = self.cursor_path / 'User' / 'workspaceStorage'
        
        if not workspace_storage_path.exists():
            print(f"❌ 工作区存储路径不存在: {workspace_storage_path}")
            return {}
        
        projects = {}
        workspace_dirs = [d for d in workspace_storage_path.iterdir() if d.is_dir()]
        print(f"🔍 找到 {len(workspace_dirs)} 个工作区目录")
        
        for workspace_dir in workspace_dirs[:10]:  # 限制处理前10个，避免太多
            try:
                state_db_path = workspace_dir / 'state.vscdb'
                if not state_db_path.exists():
                    continue
                
                project_info = self.extract_project_info_from_workspace(str(state_db_path))
                if project_info:
                    workspace_id = workspace_dir.name
                    projects[workspace_id] = project_info
                    
            except Exception as error:
                continue  # 忽略单个工作区的错误
        
        print(f"📁 成功提取 {len(projects)} 个项目信息")
        return projects
    
    def extract_project_info_from_workspace(self, db_path):
        """从工作区数据库提取项目信息"""
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            project_info = {
                'name': 'Unknown Project',
                'rootPath': None,
                'fileCount': 0
            }
            
            # 尝试从history.entries获取
            cursor.execute("SELECT value FROM cursorDiskKV WHERE key = 'history.entries'")
            result = cursor.fetchone()
            if result:
                try:
                    entries = json.loads(result[0])
                    if entries and len(entries) > 0:
                        first_entry = entries[0]
                        if 'resource' in first_entry:
                            resource = first_entry['resource']
                            if isinstance(resource, dict) and 'path' in resource:
                                path_str = resource['path']
                                project_info['rootPath'] = self.extract_project_path(path_str)
                                project_info['name'] = self.extract_project_name_from_path(project_info['rootPath'])
                except:
                    pass
            
            # 尝试从debug.selectedroot获取
            if not project_info['rootPath']:
                cursor.execute("SELECT value FROM cursorDiskKV WHERE key = 'debug.selectedroot'")
                result = cursor.fetchone()
                if result:
                    try:
                        data = json.loads(result[0])
                        if isinstance(data, str):
                            project_info['rootPath'] = self.extract_project_path(data)
                            project_info['name'] = self.extract_project_name_from_path(project_info['rootPath'])
                    except:
                        pass
            
            conn.close()
            return project_info if project_info['rootPath'] else None
            
        except Exception as error:
            return None
    
    def extract_project_path(self, path_str):
        """从路径字符串提取项目路径"""
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
    
    def match_session_to_real_project(self, session, projects_array):
        """将会话匹配到真实项目"""
        if not projects_array:
            return None
        
        session_content = ' '.join([msg.get('content', '') for msg in session.get('messages', [])]).lower()
        
        best_match = None
        best_score = 0
        
        for project in projects_array:
            score = 0
            project_name = project.get('name', '').lower()
            project_path = project.get('rootPath', '').lower()
            
            # 项目名匹配
            if project_name and project_name in session_content:
                score += 10
            
            # 路径部分匹配
            if project_path:
                path_parts = project_path.replace('\\', '/').split('/')
                for part in path_parts:
                    if part and len(part) > 2 and part in session_content:
                        score += 5
            
            # 技术栈匹配
            tech_keywords = {
                'react': ['react', 'jsx', 'component'],
                'vue': ['vue', 'vuejs', 'nuxt'],
                'node': ['node', 'express', 'npm'],
                'python': ['python', 'django', 'flask'],
                'java': ['java', 'spring', 'maven'],
                'web': ['html', 'css', 'javascript']
            }
            
            for tech, keywords in tech_keywords.items():
                if any(keyword in session_content for keyword in keywords):
                    if tech in project_name or tech in project_path:
                        score += 3
            
            if score > best_score:
                best_score = score
                best_match = project
        
        return best_match if best_score >= 5 else None
    
    def infer_project_from_messages(self, messages, session_index):
        """从消息内容推断项目信息"""
        all_text = ' '.join([msg.get('content', '') for msg in messages]).lower()
        
        # 技术栈关键词匹配
        tech_keywords = {
            'Cursor-Web': ['cursor-web', 'claude web', 'websocket', 'inject.js'],
            'React项目': ['react', 'jsx', 'component', 'usestate', 'useeffect'],
            'Vue项目': ['vue', 'vuejs', 'nuxt', 'composition api'],
            'Node.js项目': ['node', 'express', 'npm', 'package.json'],
            'Python项目': ['python', 'django', 'flask', 'pip'],
            'AI/ML咨询': ['机器学习', 'ai', 'model', 'training', 'neural'],
            'Web开发': ['html', 'css', 'javascript', 'web', 'frontend'],
            'Git管理': ['git', 'commit', 'push', 'pull', 'branch'],
            'Cursor使用': ['cursor', 'vscode', 'editor', 'extension']
        }
        
        for project_type, keywords in tech_keywords.items():
            if any(keyword in all_text for keyword in keywords):
                return {
                    'name': project_type,
                    'rootPath': f"C:\\Projects\\{project_type.replace(' ', '_')}",
                    'fileCount': len(messages) + 5
                }
        
        # 默认分类
        if len(messages) > 10:
            return {
                'name': '深度技术咨询', 
                'rootPath': 'C:\\Projects\\Technical_Deep_Dive',
                'fileCount': len(messages) + 10
            }
        else:
            return {
                'name': 'Cursor通用对话',
                'rootPath': 'C:\\Projects\\General_Chat', 
                'fileCount': len(messages) + 2
            }
    
    def run_extraction(self):
        """运行完整的数据提取流程"""
        print("🚀 开始Cursor数据提取...\n")
        
        try:
            # 提取聊天会话
            sessions = self.extract_chat_messages_from_global()
            if not sessions:
                print("❌ 未能提取到聊天会话")
                return []
            
            # 提取项目信息
            projects = self.extract_workspace_projects()
            projects_array = list(projects.values())
            
            # 处理每个会话
            processed_chats = []
            for i, session in enumerate(sessions):
                # 尝试匹配真实项目
                project_info = self.match_session_to_real_project(session, projects_array)
                
                # 如果没有匹配，使用推断
                if not project_info:
                    project_info = self.infer_project_from_messages(session['messages'], i)
                
                chat_data = {
                    'sessionId': session['sessionId'],
                    'project': project_info,
                    'messages': session['messages'],
                    'timestamp': session['timestamp'],
                    'date': session['timestamp']
                }
                
                processed_chats.append(chat_data)
            
            # 按时间排序
            processed_chats.sort(key=lambda x: x['timestamp'], reverse=True)
            
            print(f"✅ 成功处理 {len(processed_chats)} 个聊天会话")
            
            # 保存到文件
            output_file = 'test-chat-data.json'
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(processed_chats, f, ensure_ascii=False, indent=2)
            
            print(f"💾 数据已保存到 {output_file}")
            print(f"📊 文件大小: {Path(output_file).stat().st_size / 1024 / 1024:.1f} MB")
            
            return processed_chats
            
        except Exception as error:
            print(f"❌ 提取失败: {error}")
            import traceback
            traceback.print_exc()
            return []

def main():
    extractor = CursorDataExtractor()
    result = extractor.run_extraction()
    
    if result:
        print(f"\n🎉 提取完成！共 {len(result)} 个会话")
        
        # 显示项目统计
        project_stats = {}
        for chat in result:
            project_name = chat['project']['name']
            project_stats[project_name] = project_stats.get(project_name, 0) + 1
        
        print("\n📊 项目分布:")
        for project, count in sorted(project_stats.items(), key=lambda x: x[1], reverse=True):
            print(f"  {project}: {count} 个会话")
    else:
        print("\n❌ 提取失败")

if __name__ == "__main__":
    main()