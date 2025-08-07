#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cursor聊天数据提取脚本 - 修复版本
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
            import traceback
            traceback.print_exc()
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
                
                # 解析bubble key格式: bubbleId:conversationId:bubbleId
                if not key.startswith('bubbleId:'):
                    continue
                
                parts = key.split(':')
                if len(parts) < 3:
                    continue
                
                conversation_id = parts[1]  # 中间部分是会话ID
                bubble_id = parts[2]        # 最后部分是气泡ID
                
                if not value:
                    continue
                
                bubble_data = json.loads(value)
                parsed_count += 1
                
                if conversation_id not in session_groups:
                    session_groups[conversation_id] = []
                
                # 添加解析出的ID信息
                bubble_data['conversationId'] = conversation_id
                bubble_data['bubbleId'] = bubble_id
                
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
            
            # 按时间排序（如果有时间戳信息）
            session_bubbles.sort(key=lambda x: x.get('cTime', x.get('timestamp', 0)))
            
            messages = []
            session_info = {
                'sessionId': conversation_id,
                'timestamp': None,
                'workspaceInfo': None
            }
            
            for bubble in session_bubbles:
                # 提取消息内容
                message_content = ""
                message_type = "unknown"
                
                # 检查bubble的类型
                bubble_type = bubble.get('type', 0)
                
                if bubble_type == 1:  # 用户消息
                    message_type = "user"
                    message_content = bubble.get('text', '')
                elif bubble_type == 2:  # AI回复
                    message_type = "assistant"
                    message_content = bubble.get('text', '')
                    
                    # 尝试从richText获取更好的格式
                    rich_text = bubble.get('richText')
                    if rich_text and isinstance(rich_text, str) and len(rich_text) > len(message_content):
                        message_content = rich_text
                
                # 如果有有效内容，添加到消息列表
                if message_content and message_content.strip():
                    messages.append({
                        'role': message_type,
                        'content': message_content.strip(),
                        'timestamp': bubble.get('cTime', bubble.get('timestamp'))
                    })
                
                # 尝试获取会话的时间戳
                if not session_info['timestamp']:
                    session_info['timestamp'] = bubble.get('cTime', bubble.get('timestamp'))
            
            # 只保留有有效消息的会话
            if messages:
                sessions.append({
                    'sessionId': conversation_id,
                    'messages': messages,
                    'timestamp': session_info['timestamp'] or datetime.now().isoformat()
                })
        
        print(f"✅ 成功创建 {len(sessions)} 个有效会话")
        
        # 按消息数量排序，显示一些统计信息
        sessions.sort(key=lambda x: len(x['messages']), reverse=True)
        
        if sessions:
            print(f"📊 会话统计:")
            print(f"  最大会话: {len(sessions[0]['messages'])} 条消息")
            print(f"  平均会话: {sum(len(s['messages']) for s in sessions) // len(sessions)} 条消息")
            total_messages = sum(len(s['messages']) for s in sessions)
            print(f"  总消息数: {total_messages}")
        
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
        
        for workspace_dir in workspace_dirs[:20]:  # 限制处理前20个
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
            
            # 尝试从不同的key获取项目信息
            keys_to_check = [
                'history.entries',
                'debug.selectedroot',
                'memento/workbench.editors.files.textFileEditor'
            ]
            
            for key in keys_to_check:
                cursor.execute("SELECT value FROM cursorDiskKV WHERE key = ?", (key,))
                result = cursor.fetchone()
                if result and result[0]:
                    try:
                        data = json.loads(result[0])
                        path_info = self.extract_path_from_data(data)
                        if path_info:
                            project_info['rootPath'] = path_info
                            project_info['name'] = self.extract_project_name_from_path(path_info)
                            break
                    except:
                        continue
            
            conn.close()
            return project_info if project_info['rootPath'] else None
            
        except Exception as error:
            return None
    
    def extract_path_from_data(self, data):
        """从数据中提取路径信息"""
        if isinstance(data, list) and data:
            # history.entries格式
            first_entry = data[0]
            if isinstance(first_entry, dict) and 'resource' in first_entry:
                resource = first_entry['resource']
                if isinstance(resource, dict) and 'path' in resource:
                    return self.extract_project_path(resource['path'])
        elif isinstance(data, str):
            # 直接路径字符串
            return self.extract_project_path(data)
        elif isinstance(data, dict):
            # 其他格式，递归查找路径
            for value in data.values():
                if isinstance(value, str) and ('file://' in value or '\\' in value or '/' in value):
                    return self.extract_project_path(value)
        
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
            
            if score > best_score:
                best_score = score
                best_match = project
        
        # 只有当匹配分数足够高时才返回匹配结果
        if best_match and best_score >= 5:
            return best_match
        
        return None
    
    def infer_project_from_path_hints(self, messages, session_index):
        """从消息内容中的路径提示推断项目信息"""
        all_text = ' '.join([msg.get('content', '') for msg in messages])
        
        # 多层次路径模式匹配
        path_patterns = [
            # 完整的绝对路径
            r'[A-Za-z]:\\[^\s<>:"|?*\n\r]+(?:\\[^\s<>:"|?*\n\r]+)+',  # Windows完整路径
            r'/(?:[a-zA-Z0-9_.-]+/)+[a-zA-Z0-9_.-]*',  # Unix完整路径
            
            # 项目相关的文件路径模式
            r'(?:src|app|components|pages|utils|lib|modules|services|api|public|assets)(?:/|\\)[^\s<>:"|?*\n\r]+',  # 项目结构路径
            r'[a-zA-Z0-9_.-]+\.[a-zA-Z]{2,4}(?:\s|$)',  # 文件名
            
            # 目录名模式
            r'[a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_-]+)*(?:目录|directory|folder|项目|project)',  # 目录描述
        ]
        
        found_paths = []
        project_indicators = []
        
        for pattern in path_patterns:
            matches = re.findall(pattern, all_text, re.IGNORECASE)
            for match in matches:
                cleaned_match = match.strip()
                if self.is_likely_project_path(cleaned_match):
                    found_paths.append(cleaned_match)
                elif self.is_project_indicator(cleaned_match):
                    project_indicators.append(cleaned_match)
        
        # 尝试从完整路径提取项目信息
        if found_paths:
            common_path = self.find_common_project_path(found_paths)
            if common_path:
                project_name = self.extract_project_name_from_path(common_path)
                return {
                    'name': project_name,
                    'rootPath': common_path,
                    'fileCount': len(messages) + 5
                }
        
        # 如果没有完整路径，尝试从项目指示器推断
        if project_indicators:
            project_name = self.infer_project_name_from_indicators(project_indicators)
            if project_name and project_name != 'Unknown':
                return {
                    'name': project_name,
                    'rootPath': f'C:\\Projects\\{project_name}',
                    'fileCount': len(messages) + 5
                }
        
        # 最后尝试从消息内容推断项目类型
        inferred_name = self.infer_from_content_keywords(all_text)
        if inferred_name:
            return {
                'name': inferred_name,
                'rootPath': f'C:\\Projects\\{inferred_name}',
                'fileCount': len(messages) + 5
            }
        
        # 如果都没有找到，使用通用分类
        return {
            'name': f'未分类项目_{session_index + 1}',
            'rootPath': f'C:\\Projects\\未分类项目_{session_index + 1}',
            'fileCount': len(messages) + 5
        }
    
    def is_likely_project_path(self, path):
        """判断路径是否可能是项目路径"""
        if not path or len(path) < 3:
            return False
        
        # 排除系统路径和临时路径
        exclude_patterns = [
            r'C:\\Windows',
            r'C:\\Program Files',
            r'C:\\Users\\[^\\]+\\AppData',
            r'C:\\temp',
            r'/tmp',
            r'/var',
            r'/usr',
            r'/bin',
            r'/etc'
        ]
        
        for pattern in exclude_patterns:
            if re.match(pattern, path, re.IGNORECASE):
                return False
        
        # 包含常见项目关键词的路径更可能是项目路径
        project_keywords = ['project', 'workspace', 'repo', 'code', 'dev', 'src', 'app', 'web', 'api', 'frontend', 'backend']
        path_lower = path.lower()
        for keyword in project_keywords:
            if keyword in path_lower:
                return True
        
        # 检查是否是完整路径
        if '\\' in path or '/' in path:
            depth = len(path.replace('/', '\\').split('\\'))
            return 2 <= depth <= 8
        
        return False
    
    def is_project_indicator(self, text):
        """判断文本是否是项目指示器"""
        if not text or len(text) < 2:
            return False
        
        # 项目相关的关键词
        indicators = [
            'cursor-view', 'cursor-web', 'react', 'vue', 'angular', 'node', 'express',
            'webpack', 'vite', 'next', 'nuxt', 'gatsby', 'svelte', 'typescript',
            'javascript', 'python', 'django', 'flask', 'fastapi', 'spring', 'maven',
            'gradle', 'docker', 'kubernetes', 'nginx', 'apache', 'mysql', 'postgresql',
            'mongodb', 'redis', 'elasticsearch', 'rabbitmq', 'kafka'
        ]
        
        text_lower = text.lower()
        return any(indicator in text_lower for indicator in indicators)
    
    def infer_project_name_from_indicators(self, indicators):
        """从项目指示器推断项目名称"""
        if not indicators:
            return None
        
        # 统计指示器出现频率
        indicator_counts = {}
        for indicator in indicators:
            clean_indicator = re.sub(r'[^a-zA-Z0-9_-]', '', indicator.lower())
            if len(clean_indicator) > 2:
                indicator_counts[clean_indicator] = indicator_counts.get(clean_indicator, 0) + 1
        
        if indicator_counts:
            # 返回出现频率最高的指示器
            return max(indicator_counts.items(), key=lambda x: x[1])[0]
        
        return None
    
    def infer_from_content_keywords(self, content):
        """从内容关键词推断项目类型"""
        if not content:
            return None
        
        content_lower = content.lower()
        
        # 技术栈关键词映射
        tech_keywords = {
            'web开发': ['html', 'css', 'javascript', 'web', 'browser', '浏览器', '网页'],
            'react项目': ['react', 'jsx', 'component', 'hook', 'state'],
            'vue项目': ['vue', 'vuex', 'router', 'template'],
            'node项目': ['node', 'npm', 'express', 'server', '服务器'],
            'python项目': ['python', 'pip', 'django', 'flask', 'fastapi'],
            'api项目': ['api', 'rest', 'graphql', 'endpoint', '接口'],
            '数据库项目': ['database', 'sql', 'mysql', 'postgresql', 'mongodb', '数据库'],
            '移动开发': ['mobile', 'android', 'ios', 'react-native', 'flutter', '移动'],
            '桌面应用': ['desktop', 'electron', 'tauri', 'qt', '桌面'],
            '游戏开发': ['game', 'unity', 'unreal', 'godot', '游戏'],
            '机器学习': ['ml', 'ai', 'tensorflow', 'pytorch', 'sklearn', '机器学习', '人工智能']
        }
        
        # 统计每个技术栈的关键词出现次数
        tech_scores = {}
        for tech, keywords in tech_keywords.items():
            score = sum(1 for keyword in keywords if keyword in content_lower)
            if score > 0:
                tech_scores[tech] = score
        
        if tech_scores:
            # 返回得分最高的技术栈
            return max(tech_scores.items(), key=lambda x: x[1])[0]
        
        return None
    
    def find_common_project_path(self, paths):
        """从路径列表中找到最可能的项目根路径"""
        if not paths:
            return None
        
        # 统计可能的项目根路径
        project_roots = {}
        
        for path in paths:
            # 标准化路径分隔符
            normalized_path = path.replace('/', '\\')
            parts = normalized_path.split('\\')
            
            # 尝试不同的项目根路径深度
            for depth in range(2, min(len(parts), 6)):
                potential_root = '\\'.join(parts[:depth])
                
                # 检查是否是合理的项目根路径
                if self.is_reasonable_project_root(potential_root):
                    project_roots[potential_root] = project_roots.get(potential_root, 0) + 1
        
        if project_roots:
            # 返回出现频率最高且最合理的项目根路径
            return max(project_roots.items(), key=lambda x: x[1])[0]
        
        # 如果没有找到合理的项目根，返回最短的路径
        return min(paths, key=len) if paths else None
    
    def is_reasonable_project_root(self, path):
        """判断是否是合理的项目根路径"""
        if not path or len(path) < 3:
            return False
        
        # 路径应该有合理的深度
        parts = path.split('\\')
        if len(parts) < 2 or len(parts) > 5:
            return False
        
        # 最后一级目录名应该像项目名
        last_part = parts[-1].lower()
        
        # 排除明显的系统目录
        system_dirs = ['windows', 'program files', 'appdata', 'temp', 'system32']
        if any(sys_dir in last_part for sys_dir in system_dirs):
            return False
        
        # 项目目录通常不会是单个字符
        if len(last_part) <= 1:
            return False
        
        return True
    
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
            print("\n🔍 提取工作区项目信息...")
            projects = self.extract_workspace_projects()
            projects_array = list(projects.values())
            
            # 处理每个会话
            print(f"\n📝 处理 {len(sessions)} 个会话...")
            processed_chats = []
            
            for i, session in enumerate(sessions):
                # 尝试匹配到真实项目
                project_info = self.match_session_to_real_project(session, projects_array)
                
                # 如果没有匹配到真实项目，使用路径推断
                if not project_info:
                    project_info = self.infer_project_from_path_hints(session['messages'], i)
                
                chat_data = {
                    'sessionId': session['sessionId'],
                    'project': project_info,
                    'messages': session['messages'],
                    'timestamp': session['timestamp'],
                    'date': session['timestamp']
                }
                
                processed_chats.append(chat_data)
                
                # 显示进度
                if (i + 1) % 50 == 0 or i == len(sessions) - 1:
                    print(f"  处理进度: {i + 1}/{len(sessions)}")
            
            # 按时间排序
            processed_chats.sort(key=lambda x: x['timestamp'], reverse=True)
            
            print(f"\n✅ 成功处理 {len(processed_chats)} 个聊天会话")
            
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
        for project, count in sorted(project_stats.items(), key=lambda x: x[1], reverse=True)[:15]:
            print(f"  {project}: {count} 个会话")
        
        if len(project_stats) > 15:
            others = sum(list(project_stats.values())[15:])
            print(f"  ... 其他: {others} 个会话")
    else:
        print("\n❌ 提取失败")

if __name__ == "__main__":
    main()