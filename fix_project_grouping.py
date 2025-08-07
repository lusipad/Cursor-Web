#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复项目分组 - 以真实项目根目录为核心
"""

import json
import os
import re
from pathlib import Path
from collections import Counter

def extract_real_project_root(path_str):
    """提取真实的项目根目录"""
    if not path_str:
        return None
    
    # 清理路径
    path_str = path_str.replace('\\', '/').strip()
    
    # 移除文件名，保留目录
    if '.' in path_str.split('/')[-1] and len(path_str.split('/')[-1].split('.')) > 1:
        path_str = '/'.join(path_str.split('/')[:-1])
    
    # 识别主要项目根目录模式
    if '/Repos/' in path_str:
        # 对于 /Repos/ 下的项目，提取到项目名层级
        parts = path_str.split('/')
        try:
            repos_index = parts.index('Repos')
            if repos_index + 1 < len(parts):
                # 返回 Repos/项目名 层级
                project_root = '/'.join(parts[:repos_index + 2])
                project_name = parts[repos_index + 1]
                return project_root, project_name
        except:
            pass
    
    # 对于 temp 目录下的项目
    if '/temp/' in path_str:
        parts = path_str.split('/')
        try:
            temp_index = parts.index('temp')
            if temp_index + 1 < len(parts):
                project_root = '/'.join(parts[:temp_index + 2])
                project_name = parts[temp_index + 1]
                return project_root, project_name
        except:
            pass
    
    # 对于其他路径，尝试找到有意义的项目层级
    parts = [p for p in path_str.split('/') if p]
    
    # 如果路径太短，直接返回
    if len(parts) <= 1:
        return None
    
    # 查找可能的项目根目录指示符
    project_indicators = ['src', 'app', 'lib', 'project', 'workspace']
    for i, part in enumerate(parts):
        if part.lower() in project_indicators and i > 0:
            project_root = '/'.join(parts[:i+1])
            project_name = parts[i-1] if i > 0 else part
            return project_root, project_name
    
    # 如果没有找到明确指示符，返回倒数第二级或第三级目录
    if len(parts) >= 2:
        project_root = '/'.join(parts[:-1])
        project_name = parts[-2] if len(parts) >= 2 else parts[-1]
        return project_root, project_name
    
    return None

def categorize_by_real_project(path_str):
    """基于真实项目根目录进行分类"""
    if not path_str:
        return 'Other', None
    
    result = extract_real_project_root(path_str)
    if not result:
        return 'Other', None
    
    project_root, project_name = result
    
    # 对已知项目进行重命名美化
    project_mapping = {
        'claude-web': 'Claude Web项目',
        'cursor-web': 'Cursor Web项目', 
        'Cursor-Web-2': 'Cursor Web项目',
        'plcopen': 'PLC开发项目',
        'lllll': 'C++测试项目',
    }
    
    # 检查是否是已知项目
    for known_name, display_name in project_mapping.items():
        if known_name.lower() in project_name.lower() or known_name.lower() in project_root.lower():
            return display_name, project_root
    
    # 对于其他项目，使用项目名 + "项目"
    if project_name and len(project_name) > 0:
        return f'{project_name}项目', project_root
    
    return 'Other', project_root

def fix_project_grouping():
    """修复项目分组"""
    
    # 加载聊天数据
    if not os.path.exists('test-chat-data.json'):
        print("❌ 聊天数据文件不存在")
        return
    
    with open('test-chat-data.json', 'r', encoding='utf-8') as f:
        chat_data = json.load(f)
    
    print(f"📊 加载了 {len(chat_data)} 个聊天会话")
    
    # 重新分组
    updated_count = 0
    project_stats = {}
    
    for chat in chat_data:
        session_id = chat['sessionId']
        current_project = chat.get('project', {})
        current_path = current_project.get('rootPath', '')
        
        # 重新分类
        new_project_name, new_project_root = categorize_by_real_project(current_path)
        
        # 更新项目信息
        chat['project'] = {
            'name': new_project_name,
            'rootPath': new_project_root or current_path,
            'fileCount': current_project.get('fileCount', 0)
        }
        
        # 统计
        project_stats[new_project_name] = project_stats.get(new_project_name, 0) + 1
        updated_count += 1
        
        print(f"✅ 更新: {session_id[:8]}... -> {new_project_name}")
        if new_project_root:
            print(f"    路径: {new_project_root}")
    
    print(f"\n📊 更新统计:")
    print(f"  成功重新分组: {updated_count} 个会话")
    
    # 显示新的项目分布
    print(f"\n📊 新的项目分布:")
    sorted_projects = sorted(project_stats.items(), key=lambda x: x[1], reverse=True)
    
    main_projects = []
    other_projects = []
    
    for project, count in sorted_projects:
        if count >= 5 or any(keyword in project for keyword in ['Claude', 'Cursor', 'PLC', 'C++']):
            main_projects.append((project, count))
        else:
            other_projects.append((project, count))
    
    print("\n🎯 主要项目:")
    for project, count in main_projects:
        print(f"  {project}: {count} 个会话")
    
    if other_projects:
        print(f"\n📁 其他项目:")
        for project, count in other_projects:
            print(f"  {project}: {count} 个会话")
    
    # 保存更新后的数据
    with open('test-chat-data.json', 'w', encoding='utf-8') as f:
        json.dump(chat_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 已保存更新后的聊天数据")
    
    return chat_data

def main():
    print("🔄 开始修复项目分组逻辑...\n")
    fix_project_grouping()
    print("\n✅ 项目分组修复完成！")

if __name__ == "__main__":
    main()