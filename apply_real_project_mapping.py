#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
应用真实项目映射进行正确分组
"""

import json
import os
from pathlib import Path

def extract_main_project_from_path(path_str):
    """从真实路径提取主项目名称"""
    if not path_str:
        return 'Other', path_str
    
    path_str = path_str.replace('\\', '/')
    
    # 基于真实路径的项目识别
    if any(keyword in path_str.lower() for keyword in ['claude-web', 'cursor-web']):
        return 'Cursor Web项目', path_str
    elif 'plcopen' in path_str.lower():
        return 'PLC开发项目', path_str
    elif '/temp/' in path_str and 'lllll' in path_str:
        return 'C++测试项目', path_str
    elif any(keyword in path_str.lower() for keyword in ['trajectory', 'viewer']):
        return '轨迹可视化项目', path_str
    
    # 对于其他项目，尝试从路径中提取有意义的名称
    if '/Repos/' in path_str:
        parts = path_str.split('/')
        try:
            repos_index = parts.index('Repos')
            if repos_index + 1 < len(parts):
                project_name = parts[repos_index + 1]
                return f'{project_name}项目', path_str
        except:
            pass
    
    # 如果是子目录路径，归类为"其他"
    if any(subdir in path_str.lower() for subdir in ['public', 'src', 'modules', 'utils', 'tests']):
        return 'Other', path_str
    
    return 'Other', path_str

def apply_real_project_mapping():
    """应用真实项目映射"""
    
    # 加载真实路径映射
    if not os.path.exists('real_project_mapping.json'):
        print("❌ 真实路径映射文件不存在")
        return
    
    with open('real_project_mapping.json', 'r', encoding='utf-8') as f:
        real_mapping = json.load(f)
    
    print(f"📁 加载了 {len(real_mapping)} 个真实路径映射")
    
    # 加载聊天数据
    with open('test-chat-data.json', 'r', encoding='utf-8') as f:
        chat_data = json.load(f)
    
    print(f"📊 加载了 {len(chat_data)} 个聊天会话")
    
    # 应用真实映射
    mapped_count = 0
    unmapped_count = 0
    project_stats = {}
    
    for chat in chat_data:
        session_id = chat['sessionId']
        
        if session_id in real_mapping:
            # 使用真实路径映射
            real_info = real_mapping[session_id]
            real_path = real_info['rootPath']
            
            # 基于真实路径确定项目名称
            project_name, clean_path = extract_main_project_from_path(real_path)
            
            chat['project'] = {
                'name': project_name,
                'rootPath': clean_path,
                'fileCount': real_info.get('fileCount', 0)
            }
            
            mapped_count += 1
            print(f"✅ 映射: {session_id[:8]}... -> {project_name}")
            if clean_path != real_path:
                print(f"    真实路径: {real_path}")
        else:
            # 没有真实路径映射的，归类为其他
            chat['project'] = {
                'name': 'Other',
                'rootPath': 'Unknown',
                'fileCount': 0
            }
            unmapped_count += 1
        
        # 统计
        project_name = chat['project']['name']
        project_stats[project_name] = project_stats.get(project_name, 0) + 1
    
    print(f"\n📊 映射统计:")
    print(f"  成功映射: {mapped_count} 个会话")
    print(f"  未映射: {unmapped_count} 个会话")
    
    # 显示项目分布 - 按实际项目分组
    print(f"\n🎯 项目分布:")
    main_projects = []
    other_sessions = 0
    
    for project, count in sorted(project_stats.items(), key=lambda x: x[1], reverse=True):
        if project == 'Other':
            other_sessions = count
        else:
            main_projects.append((project, count))
    
    # 显示主要项目
    for project, count in main_projects:
        print(f"  {project}: {count} 个会话")
    
    if other_sessions > 0:
        print(f"  其他/未分类: {other_sessions} 个会话")
    
    # 保存更新后的数据
    with open('test-chat-data.json', 'w', encoding='utf-8') as f:
        json.dump(chat_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 已保存更新后的聊天数据")
    
    return chat_data

def main():
    print("🔄 开始应用真实项目映射...\n")
    apply_real_project_mapping()
    print("\n✅ 项目映射应用完成！")

if __name__ == "__main__":
    main()