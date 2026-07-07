import json
import sys
import re
import os

def extract_valid_ids(data):
    valid_ids = set()
    duplicate_errors = []
    if 'tabs' in data and isinstance(data['tabs'], dict):
        for tab_id, tab in data['tabs'].items():
            if 'questions' in tab and isinstance(tab['questions'], dict):
                for q_id, q in tab['questions'].items():
                    if q_id in valid_ids:
                        duplicate_errors.append(f"Duplicate question ID found: '{q_id}'")
                    valid_ids.add(q_id)
                    if 'subFields' in q and isinstance(q['subFields'], list):
                        for sub in q['subFields']:
                            if 'id' in sub:
                                sub_id = sub['id']
                                if sub_id in valid_ids:
                                    duplicate_errors.append(f"Duplicate subfield ID found: '{sub_id}'")
                                valid_ids.add(sub_id)
    return valid_ids, duplicate_errors

def extract_expressions_and_types(obj):
    exprs = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == 'dependsOnExpression':
                exprs.append(v)
            else:
                exprs.extend(extract_expressions_and_types(v))
    elif isinstance(obj, list):
        for item in obj:
            exprs.extend(extract_expressions_and_types(item))
    return exprs

def validate_dependencies(obj, valid_ids, errors, parent_id=None):
    # Regex to find potential variable names (alphanumeric and underscores)
    var_regex = re.compile(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b')
    reserved_words = {'true', 'false', 'null', 'includes', 'length', 'indexOf', 'AND', 'OR', 'NOT', 'SOME', 'EVERY', 'Array', 'String', 'answers', 'row'}
    
    if isinstance(obj, dict):
        current_id = obj.get('id', parent_id)
        if 'dependsOnExpression' in obj:
            expr = obj['dependsOnExpression']
            if isinstance(expr, str):
                # Remove string literals before extracting variables
                expr_no_strings = re.sub(r'".*?"|\'.*?\'', '', expr)
                vars_found = var_regex.findall(expr_no_strings)
                
                invalid_refs = [var for var in set(vars_found) if var not in reserved_words and var not in valid_ids]
                if invalid_refs:
                    q_ref = f"Question '{current_id}'" if current_id else "A question"
                    errors.append(f"Validation Error: {q_ref} has invalid dependsOnExpression '{expr}'. It depends on non-existent question IDs: {invalid_refs}")
                    
        for v in obj.values():
            validate_dependencies(v, valid_ids, errors, current_id)
    elif isinstance(obj, list):
        for item in obj:
            validate_dependencies(item, valid_ids, errors, parent_id)

def validate_schema_types_and_keys(data):
    valid_types = {'text', 'textarea', 'radio', 'checkbox', 'file', 'dynamic-list', 'label'}
    valid_root_keys = {'version', 'tabs', 'tabs_layout'}
    valid_tab_keys = {'id', 'title', 'questions', 'layout'}
    valid_q_keys = {'id', 'text', 'type', 'options', 'required', 'placeholder', 'tooltip', 'dependsOnExpression', 'subFields', 'minRows', 'maxRows', 'fileUploadConfig'}
    valid_sub_keys = {'id', 'text', 'type', 'options', 'required', 'placeholder', 'minRows', 'maxRows', 'fileUploadConfig'}
    valid_file_keys = {'multiple', 'maxFiles'}
    
    errors = []
    
    for key in data.keys():
        if key not in valid_root_keys:
            errors.append(f"Invalid root key '{key}' at path '/{key}'. Must be one of: {', '.join(valid_root_keys)}")
            
    if 'tabs' in data and isinstance(data['tabs'], dict):
        for tab_id, tab in data['tabs'].items():
            for k in tab.keys():
                if k not in valid_tab_keys:
                    errors.append(f"Invalid tab key '{k}' at path '/tabs/{tab_id}/{k}' (tab '{tab.get('id', 'unknown')}'). Must be one of: {', '.join(valid_tab_keys)}")
                    
            if 'questions' in tab and isinstance(tab['questions'], dict):
                for q_id, q in tab['questions'].items():
                    for k in q.keys():
                        if k not in valid_q_keys:
                            errors.append(f"Invalid question key '{k}' at path '/tabs/{tab_id}/questions/{q_id}/{k}' (question '{q.get('id', 'unknown')}'). Must be one of: {', '.join(valid_q_keys)}")
                    
                    if 'fileUploadConfig' in q and isinstance(q['fileUploadConfig'], dict):
                        for k in q['fileUploadConfig'].keys():
                            if k not in valid_file_keys:
                                errors.append(f"Invalid fileUploadConfig key '{k}' at path '/tabs/{tab_id}/questions/{q_id}/fileUploadConfig/{k}'. Must be one of: {', '.join(valid_file_keys)}")

                    q_type = q.get('type')
                    if q_type and q_type not in valid_types:
                        errors.append(f"Invalid question type '{q_type}' at path '/tabs/{tab_id}/questions/{q_id}/type'. Must be one of: {', '.join(valid_types)}")
                    
                    for s_idx, sub in enumerate(q.get('subFields', [])):
                        for k in sub.keys():
                            if k not in valid_sub_keys:
                                errors.append(f"Invalid subfield key '{k}' at path '/tabs/{tab_id}/questions/{q_id}/subFields/{s_idx}/{k}'. Must be one of: {', '.join(valid_sub_keys)}")
                        sub_type = sub.get('type')
                        if sub_type and sub_type not in valid_types:
                            errors.append(f"Invalid subfield type '{sub_type}' at path '/tabs/{tab_id}/questions/{q_id}/subFields/{s_idx}/type'. Must be one of: {', '.join(valid_types)}")
    return errors

def check_json():
    # Allow the path to be passed as an argument, default to the local file
    file_path = sys.argv[1] if len(sys.argv) > 1 else 'fria_hr_form.json'
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        valid_ids, duplicate_errors = extract_valid_ids(data)
        
        dependency_errors = []
        validate_dependencies(data, valid_ids, dependency_errors)
        
        errors = list(duplicate_errors) + dependency_errors
        
        type_errors = validate_schema_types_and_keys(data)
        errors.extend(type_errors)
        
        if errors:
            print("FAIL: Validation Errors Found:")
            for err in errors:
                print(f"- {err}")
            sys.exit(1)
            
        print("PASS: Syntax and Dependency Logic OK")
    except FileNotFoundError:
        print(f"ERROR: Could not find {file_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON structure: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    check_json()
