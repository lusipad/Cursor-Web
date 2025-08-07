#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
使用真实路径更新聊天数据
"""

import json
import os
from pathlib import Path

def clean_and_normalize_path(path_str):
    """清理和标准化路径"""
    if not path_str:
        return None
    
    # 移除前缀
    if path_str.startswith('/d:/'):
        path_str = 'd:/' + path_str[4:]
    elif path_str.startswith('/'):
        path_str = path_str[1:]
    
    # 标准化分隔符
    path_str = path_str.replace('\\', '/')
    
    # 移除文件名，保留目录
    if '.' in path_str.split('/')[-1]:  # 如果最后部分包含扩展名，是文件
        path_str = '/'.join(path_str.split('/')[:-1])
    
    return path_str

def extract_project_name_from_real_path(path_str):
    """从真实路径提取项目名称"""
    if not path_str:
        return 'Unknown Project'
    
    # 清理路径
    path_str = clean_and_normalize_path(path_str)
    
    if not path_str:
        return 'Unknown Project'
    
    # 按常见模式提取项目名
    if 'Repos' in path_str:
        # 提取Repos后面的部分
        parts = path_str.split('/')
        try:
            repos_index = parts.index('Repos')
            if repos_index + 1 < len(parts):
                project_name = parts[repos_index + 1]
                return project_name
        except:
            pass
    
    # 如果没有Repos，取最后一个非空目录
    parts = [p for p in path_str.split('/') if p and p != '.']
    if parts:
        return parts[-1]
    
    return 'Unknown Project'

def categorize_by_real_path(path_str):
    """根据真实路径进行分类"""
    if not path_str:
        return 'Unknown Project'
    
    path_lower = path_str.lower()
    
    # 基于路径内容的精确匹配
    if 'claude-web' in path_lower or 'cursor-web' in path_lower:
        return 'Cursor-Web项目'
    elif 'plcopen' in path_lower:
        return 'PLC开发项目'
    elif any(keyword in path_lower for keyword in ['trajectory', 'viewer']):
        return '轨迹可视化项目'
    elif 'cmake' in path_lower or 'src' in path_lower:
        return 'C++开发项目'
    elif any(keyword in path_lower for keyword in ['browser', 'client', 'script']):
        return '浏览器脚本项目'
    elif 'package.json' in path_lower:
        return 'Node.js项目'
    else:
        # 提取Repos后的项目名
        project_name = extract_project_name_from_real_path(path_str)
        if project_name != 'Unknown Project':
            return f'{project_name}项目'
        return 'Unknown Project'

def update_chat_data_with_real_paths():
    """使用真实路径更新聊天数据"""
    
    # 加载真实路径映射
    if not os.path.exists('real_project_mapping.json'):
        print("❌ 真实路径映射文件不存在")
        return
    
    with open('real_project_mapping.json', 'r', encoding='utf-8') as f:
        real_paths = json.load(f)
    
    # 加载聊天数据
    if not os.path.exists('test-chat-data.json'):
        print("❌ 聊天数据文件不存在")
        return
    
    with open('test-chat-data.json', 'r', encoding='utf-8') as f:
        chat_data = json.load(f)
    
    print(f"📊 加载了 {len(chat_data)} 个聊天会话")
    print(f"📁 加载了 {len(real_paths)} 个真实路径映射")
    
    # 更新聊天数据
    updated_count = 0
    for chat in chat_data:
        session_id = chat['sessionId']
        
        if session_id in real_paths:
            real_path_info = real_paths[session_id]
            real_path = real_path_info['rootPath']
            
            # 清理路径
            cleaned_path = clean_and_normalize_path(real_path)
            
            # 生成新的项目信息
            new_project_name = categorize_by_real_path(real_path)
            
            # 更新项目信息
            chat['project'] = {
                'name': new_project_name,
                'rootPath': cleaned_path or real_path,
                'fileCount': real_path_info.get('fileCount', 0)
            }
            
            updated_count += 1
            
            print(f"✅ 更新: {session_id[:8]}... -> {new_project_name} ({cleaned_path})")
    
    print(f"\n📊 更新统计:")
    print(f"  成功更新: {updated_count} 个会话")
    print(f"  未更新: {len(chat_data) - updated_count} 个会话")
    
    # 保存更新后的数据
    with open('test-chat-data.json', 'w', encoding='utf-8') as f:
        json.dump(chat_data, f, ensure_ascii=False, indent=2)
    
    print(f"💾 已保存更新后的聊天数据")
    
    # 显示新的项目分布
    project_stats = {}
    for chat in chat_data:
        project_name = chat['project']['name']
        project_stats[project_name] = project_stats.get(project_name, 0) + 1
    
    print(f"\n📊 新的项目分布:")
    for project, count in sorted(project_stats.items(), key=lambda x: x[1], reverse=True):
        print(f"  {project}: {count} 个会话")
    
    return chat_data

def main():
    print("🔄 开始使用真实路径更新聊天数据...\n")
    update_chat_data_with_real_paths()
    print("\n✅ 更新完成！")

if __name__ == "__main__":
    main()