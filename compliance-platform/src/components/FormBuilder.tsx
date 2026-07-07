import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { Plus, Trash2, Edit2, Save, GripVertical, Download, Upload, ChevronUp, ChevronDown, RefreshCw, X, Sparkles, ListOrdered, Copy, Check, ChevronRight, Clock, Activity, AlertTriangle, BrainCircuit, Loader2, BookOpen, Play, Ban } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { generateShortId } from '../utils/idGenerator';
import { validateFormConfig } from '../utils/expressionParser';
import { getInstanceId } from '../utils/instanceId';
import { formatDateYMD } from '../utils/dateUtils';

const StickyOffsetContext = React.createContext<number>(0);
const StickyDepthContext = React.createContext<number>(0);

const parseServerTimestamp = (ts: any) => {
  if (!ts) return new Date(NaN);
  let tsStr = String(ts);
  if (!tsStr.endsWith('Z') && !tsStr.includes('+')) tsStr += 'Z';
  return new Date(tsStr);
};

// Helper functions for dual-schema support (Legacy Arrays vs New Dictionary+Layout)
const getTabs = (cfg: any) => {
  if (!cfg) return [];
  if (Array.isArray(cfg.tabs)) return cfg.tabs;
  if (cfg.tabs_layout && cfg.tabs) {
    const layoutTabs = cfg.tabs_layout.map((id: string) => cfg.tabs[id]).filter(Boolean);
    const layoutSet = new Set(cfg.tabs_layout);
    const orphanedTabs = Object.keys(cfg.tabs)
      .filter(id => !layoutSet.has(id))
      .map(id => cfg.tabs[id])
      .filter(Boolean);
    return [...layoutTabs, ...orphanedTabs];
  }
  return [];
};

const getQuestions = (tab: any) => {
  if (!tab) return [];
  if (Array.isArray(tab.questions)) return tab.questions;
  if (tab.layout && tab.questions) {
    const layoutQs = tab.layout.map((id: string) => tab.questions[id]).filter(Boolean);
    const layoutSet = new Set(tab.layout);
    const orphanedQs = Object.keys(tab.questions)
      .filter(id => !layoutSet.has(id))
      .map(id => tab.questions[id])
      .filter(Boolean);
    return [...layoutQs, ...orphanedQs];
  }
  return [];
};



// Bulletproof scroll lock hook to prevent modal scroll bleed
function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;
    
    // Save original overflow
    const originalStyle = window.getComputedStyle(document.body).overflow;
    
    // Set body to hidden
    document.body.style.overflow = 'hidden';
    
    // Prevent touch/wheel scrolling on document when modal is open
    // unless the target is inside a scrollable container
    const preventScroll = (e: Event) => {
      // Find closest scrollable parent
      let target = e.target as HTMLElement | null;
      let canScroll = false;
      
      while (target && target !== document.body) {
        const style = window.getComputedStyle(target);
        const overflowY = style.overflowY;
        const isScrollable = overflowY === 'auto' || overflowY === 'scroll';
        
        if (isScrollable && target.scrollHeight > target.clientHeight) {
          canScroll = true;
          // Check if we are at boundaries (only for wheel/touchmove)
          if (e.type === 'wheel') {
            const wheelEvent = e as WheelEvent;
            const isScrollingUp = wheelEvent.deltaY < 0;
            const isScrollingDown = wheelEvent.deltaY > 0;
            const isAtTop = target.scrollTop === 0;
            const isAtBottom = Math.abs(target.scrollHeight - target.clientHeight - target.scrollTop) < 1;
            
            if ((isScrollingUp && isAtTop) || (isScrollingDown && isAtBottom)) {
              canScroll = false; // Prevent bounce at boundaries
            }
          }
          break;
        }
        target = target.parentElement;
      }
      
      if (!canScroll) {
        if (e.cancelable) e.preventDefault();
      }
    };

    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.body.style.overflow = originalStyle;
      // Delay removing the event listeners to absorb momentum scrolling
      setTimeout(() => {
        document.removeEventListener('wheel', preventScroll);
        document.removeEventListener('touchmove', preventScroll);
      }, 600);
    };
  }, [isLocked]);
}

const QuestionEditor = ({ tab, q, qIndex, localConfig, updateQuestion, removeQuestion, moveQuestionUp, moveQuestionDown, updateQuestionId }: any) => {
  const [helperQ, setHelperQ] = useState('');
  const [helperSubQ, setHelperSubQ] = useState('');
  const [helperFunc, setHelperFunc] = useState('SOME');
  const [helperOp, setHelperOp] = useState('==');
  const [helperVal, setHelperVal] = useState('');
  
  // State for Exclusion Group Condition Helper

  // Collect all questions for the helper dropdown
  const allQuestions = (getTabs(localConfig) || []).flatMap((t: any) => getQuestions(t));
  const selectedHelperQ = allQuestions.find((allQ: any) => allQ.id === helperQ);
  const selectedHelperSubQ = selectedHelperQ?.type === 'dynamic-list' ? selectedHelperQ.subFields?.find((sf: any) => sf.id === helperSubQ) : null;
    
  const handleInsertCondition = () => {
    if (!helperQ) return;
    
    let cond = '';
    if (selectedHelperQ?.type === 'dynamic-list') {
      if (!helperSubQ) return;
      let innerCond = `${helperSubQ} ${helperOp} "${helperVal}"`;
      if (!helperVal && (helperOp === '==' || helperOp === '!=')) {
        innerCond = helperOp === '!=' ? `NOT ${helperSubQ}` : helperSubQ;
      } else if (!helperVal) {
        innerCond = `${helperSubQ} ${helperOp} ""`;
      }
      cond = `${helperFunc}(${helperQ}, ${innerCond})`;
    } else {
      cond = `${helperQ} ${helperOp} "${helperVal}"`;
      if (!helperVal && (helperOp === '==' || helperOp === '!=')) {
        cond = helperOp === '!=' ? `NOT ${helperQ}` : helperQ;
      } else if (!helperVal) {
        cond = `${helperQ} ${helperOp} ""`;
      }
    }

    const currentExpr = q.dependsOnExpression || '';
    const newExpr = currentExpr ? `${currentExpr} AND ${cond}` : cond;
    updateQuestion(tab.id, q.id, 'dependsOnExpression', newExpr);
    setHelperQ('');
    setHelperSubQ('');
    setHelperOp('==');
    setHelperVal('');
  };

  

  return (
    <div className="bg-[#F3F4F6] dark:bg-[#0A0A0B] border border-gray-200 dark:border-[#27272A] rounded-xl -mx-4 p-4 flex flex-col md:flex-row gap-4">
      <div className="flex flex-row md:flex-col items-center justify-center md:justify-start gap-2 text-gray-600 dark:text-gray-400 shrink-0">
        <GripVertical className="w-5 h-5 hidden md:block" />
        <button onClick={() => moveQuestionUp(tab.id, qIndex)} disabled={qIndex === 0} className="p-1 hover:text-gray-800 dark:hover:text-gray-200">
          <ChevronUp className={`w-5 h-5 ${qIndex === 0 ? 'opacity-30' : ''}`} />
        </button>
        <button onClick={() => moveQuestionDown(tab.id, qIndex)} disabled={qIndex === getQuestions(getTabs(localConfig).find((t:any)=>t.id===tab.id)).length - 1} className="p-1 hover:text-gray-800 dark:hover:text-gray-200">
          <ChevronDown className={`w-5 h-5 ${qIndex === getQuestions(getTabs(localConfig).find((t:any)=>t.id===tab.id)).length - 1 ? 'opacity-30' : ''}`} />
        </button>
      </div>
      <div className="flex-1 space-y-4">
        
        {/* ID Editing */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex items-center space-x-2 bg-slate-100 dark:bg-[#1C1C1E] p-2 rounded-lg text-sm flex-1">
            <span className="font-semibold text-gray-700 dark:text-gray-400">ID:</span>
            <input 
              type="text" 
              defaultValue={q.id}
              onBlur={(e) => updateQuestionId(tab.id, q.id, e.target.value)}
              className="bg-white dark:bg-[#0A0A0B] border border-gray-200 dark:border-[#27272A] rounded px-2 py-1 flex-1 font-mono text-gray-600 dark:text-gray-300 focus:ring-1 focus:ring-primary-500"
            />
          </div>

        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-8">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1">Question Text</label>
            <textarea 
              rows={2}
              value={q.text}
              onChange={(e) => updateQuestion(tab.id, q.id, 'text', e.target.value)}
              className="w-full bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm resize-y"
            />
          </div>
          <div className="col-span-12 md:col-span-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1">Type</label>
              <select 
                value={q.type}
                onChange={(e) => updateQuestion(tab.id, q.id, 'type', e.target.value)}
                className="w-full bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm"
              >
                <option value="text">Text (Short)</option>
                <option value="textarea">Text (Long)</option>
                <option value="radio">Radio</option>
                <option value="checkbox">Checkbox</option>
                <option value="file">File Upload</option>
                <option value="dynamic-list">Dynamic List</option>
                <option value="label">Label (Read Only)</option>
              </select>
            </div>
            {q.type !== 'label' && (
              <div className="flex flex-col gap-2 w-full">
                <label className="flex items-center space-x-2 bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm w-full cursor-pointer hover:bg-[#F3F4F6] dark:hover:bg-slate-700">
                  <input 
                    type="checkbox" 
                    checked={q.required}
                    onChange={(e) => updateQuestion(tab.id, q.id, 'required', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="font-medium">Required</span>
                </label>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1">Tooltip (Helper Text)</label>
            <textarea 
              rows={2}
              value={q.tooltip || ''}
              onChange={(e) => updateQuestion(tab.id, q.id, 'tooltip', e.target.value)}
              className="w-full bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm resize-y"
              placeholder="Explanation for the user..."
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1">Placeholder</label>
            <textarea 
              rows={2}
              value={q.placeholder || ''}
              onChange={(e) => updateQuestion(tab.id, q.id, 'placeholder', e.target.value)}
              className="w-full bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm resize-y"
              placeholder="e.g. Example text..."
              disabled={!['text', 'textarea'].includes(q.type)}
            />
          </div>
        </div>

        {/* URL Config */}


        {/* Dynamic List Limits */}
        {q.type === 'dynamic-list' && (
          <div className="bg-slate-100 dark:bg-[#1C1C1E]/50 p-4 rounded-xl space-y-3">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400">List Row Limits</label>
            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-700 dark:text-gray-300">Min Rows:</span>
                <input 
                  type="number" 
                  min="0"
                  value={q.minRows ?? 0}
                  onChange={(e) => updateQuestion(tab.id, q.id, 'minRows', parseInt(e.target.value) || 0)}
                  className="w-20 bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-700 dark:text-gray-300">Max Rows:</span>
                <input 
                  type="number" 
                  min="1"
                  value={q.maxRows || ''}
                  onChange={(e) => updateQuestion(tab.id, q.id, 'maxRows', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="No Limit"
                  className="w-24 bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded px-2 py-1 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* File Upload Config */}
        {q.type === 'file' && (
          <div className="bg-slate-100 dark:bg-[#1C1C1E]/50 p-4 rounded-xl space-y-3">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400">File Upload Limits</label>
            <div className="flex gap-4 items-center">
              <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                <input 
                  type="checkbox"
                  checked={q.fileUploadConfig?.multiple || false}
                  onChange={(e) => updateQuestion(tab.id, q.id, 'fileUploadConfig', { ...q.fileUploadConfig, multiple: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span>Allow Multiple Files</span>
              </label>
              
              {q.fileUploadConfig?.multiple && (
                <div className="flex items-center space-x-2 border-l border-slate-300 dark:border-[#27272A] pl-4">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Max Files:</span>
                  <input 
                    type="number" 
                    min="2"
                    value={q.fileUploadConfig?.maxFiles || ''}
                    onChange={(e) => updateQuestion(tab.id, q.id, 'fileUploadConfig', { ...q.fileUploadConfig, maxFiles: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="No Limit"
                    className="w-24 bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded px-2 py-1 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Options List */}
        {(q.type === 'radio' || q.type === 'checkbox') && (
          <div className="bg-slate-100 dark:bg-[#1C1C1E]/50 p-4 rounded-xl space-y-3">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400">Options</label>
            {(q.options || []).map((opt: string, optIdx: number) => (
              <div key={optIdx} className="flex gap-2">
                <input 
                  type="text" 
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...(q.options || [])];
                    newOpts[optIdx] = e.target.value;
                    updateQuestion(tab.id, q.id, 'options', newOpts);
                  }}
                  className="flex-1 min-w-0 bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm"
                />
                <button 
                  onClick={() => {
                    if (optIdx === 0) return;
                    const newOpts = [...(q.options || [])];
                    [newOpts[optIdx - 1], newOpts[optIdx]] = [newOpts[optIdx], newOpts[optIdx - 1]];
                    updateQuestion(tab.id, q.id, 'options', newOpts);
                  }}
                  disabled={optIdx === 0}
                  className="p-2 text-gray-700 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-[#1C1C1E] rounded-lg disabled:opacity-30 shrink-0"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => {
                    const newOpts = [...(q.options || [])];
                    if (optIdx === newOpts.length - 1) return;
                    [newOpts[optIdx], newOpts[optIdx + 1]] = [newOpts[optIdx + 1], newOpts[optIdx]];
                    updateQuestion(tab.id, q.id, 'options', newOpts);
                  }}
                  disabled={optIdx === (q.options || []).length - 1}
                  className="p-2 text-gray-700 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-[#1C1C1E] rounded-lg disabled:opacity-30 shrink-0"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => {
                    if (!window.confirm("Are you sure you want to delete this option?")) return;
                    const newOpts = [...(q.options || [])];
                    newOpts.splice(optIdx, 1);
                    updateQuestion(tab.id, q.id, 'options', newOpts);
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button 
              onClick={() => updateQuestion(tab.id, q.id, 'options', [...(q.options || []), `Option ${(q.options?.length || 0) + 1}`])}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Option
            </button>
          </div>
        )}

        {/* Exclusion Groups for Checkboxes */}
        

        {/* Dynamic Subfields List */}
        {q.type === 'dynamic-list' && (
          <div className="bg-slate-100 dark:bg-[#1C1C1E]/50 p-4 rounded-xl space-y-3 border border-gray-200 dark:border-[#27272A]">
            <label className="block text-sm font-bold text-gray-800 dark:text-gray-200">Sub-fields (Questions)</label>
            {(q.subFields || []).map((sf: any, sfIdx: number) => {
              const sfObj = typeof sf === 'string' ? { id: `sf_${generateShortId()}`, text: sf, type: 'text', required: false } : sf;
              return (
                <div key={sfIdx} className="flex gap-4 bg-white dark:bg-[#0A0A0B] p-4 rounded-xl border border-gray-200 dark:border-[#27272A] shadow-sm">
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1">Sub-field ID</label>
                        <input 
                          type="text" 
                          value={sfObj.id}
                          onChange={(e) => {
                            const newSF = [...(q.subFields || [])];
                            newSF[sfIdx] = { ...sfObj, id: e.target.value };
                            updateQuestion(tab.id, q.id, 'subFields', newSF);
                          }}
                          placeholder="e.g. sf_abc"
                          className="w-full bg-[#F3F4F6] dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div className="flex-[2]">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1">Label Text</label>
                        <input 
                          type="text" 
                          value={sfObj.text}
                          onChange={(e) => {
                            const newSF = [...(q.subFields || [])];
                            newSF[sfIdx] = { ...sfObj, text: e.target.value };
                            updateQuestion(tab.id, q.id, 'subFields', newSF);
                          }}
                          placeholder="e.g. First Name"
                          className="w-full bg-[#F3F4F6] dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4 items-center">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1">Type</label>
                        <select 
                          value={sfObj.type}
                          onChange={(e) => {
                            const newSF = [...(q.subFields || [])];
                            newSF[sfIdx] = { ...sfObj, type: e.target.value };
                            updateQuestion(tab.id, q.id, 'subFields', newSF);
                          }}
                          className="w-full bg-[#F3F4F6] dark:bg-[#1C1C1E] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="text">Text (Short)</option>
                          <option value="textarea">Text (Long)</option>
                          <option value="radio">Radio</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="file">File Upload</option>
                          <option value="label">Label</option>
                        </select>
                      </div>
                      {sfObj.type !== 'label' && (
                        <label className="flex items-center space-x-2 pt-4 cursor-pointer text-gray-800 dark:text-gray-200">
                          <input 
                            type="checkbox"
                            checked={sfObj.required}
                            onChange={(e) => {
                              const newSF = [...(q.subFields || [])];
                              newSF[sfIdx] = { ...sfObj, required: e.target.checked };
                              updateQuestion(tab.id, q.id, 'subFields', newSF);
                            }}
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm font-medium">Required</span>
                        </label>
                      )}
                    </div>
                    {(sfObj.type === 'radio' || sfObj.type === 'checkbox') && (
                      <div className="mt-4 p-3 bg-[#F3F4F6] dark:bg-[#1C1C1E] rounded-lg border border-gray-200 dark:border-[#27272A]">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-400 mb-2">Options</label>
                        <div className="space-y-2">
                          {(sfObj.options || []).map((opt: string, optIdx: number) => (
                            <div key={optIdx} className="flex items-center space-x-2">
                              <input 
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const newSF = [...(q.subFields || [])];
                                  const newOpts = [...(sfObj.options || [])];
                                  newOpts[optIdx] = e.target.value;
                                  newSF[sfIdx] = { ...sfObj, options: newOpts };
                                  updateQuestion(tab.id, q.id, 'subFields', newSF);
                                }}
                                className="flex-1 min-w-0 bg-white dark:bg-[#0A0A0B] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-md px-2 py-1 text-sm focus:ring-primary-500"
                              />
                              <button 
                                onClick={() => {
                                  if (optIdx === 0) return;
                                  const newSF = [...(q.subFields || [])];
                                  const newOpts = [...(sfObj.options || [])];
                                  [newOpts[optIdx - 1], newOpts[optIdx]] = [newOpts[optIdx], newOpts[optIdx - 1]];
                                  newSF[sfIdx] = { ...sfObj, options: newOpts };
                                  updateQuestion(tab.id, q.id, 'subFields', newSF);
                                }}
                                disabled={optIdx === 0}
                                className="text-gray-700 dark:text-gray-400 hover:text-gray-700 hover:bg-slate-100 dark:hover:bg-[#1C1C1E] rounded p-1 transition-colors disabled:opacity-30 shrink-0"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => {
                                  const newOpts = [...(sfObj.options || [])];
                                  if (optIdx === newOpts.length - 1) return;
                                  const newSF = [...(q.subFields || [])];
                                  [newOpts[optIdx], newOpts[optIdx + 1]] = [newOpts[optIdx + 1], newOpts[optIdx]];
                                  newSF[sfIdx] = { ...sfObj, options: newOpts };
                                  updateQuestion(tab.id, q.id, 'subFields', newSF);
                                }}
                                disabled={optIdx === (sfObj.options || []).length - 1}
                                className="text-gray-700 dark:text-gray-400 hover:text-gray-700 hover:bg-slate-100 dark:hover:bg-[#1C1C1E] rounded p-1 transition-colors disabled:opacity-30 shrink-0"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => {
                                  const newSF = [...(q.subFields || [])];
                                  const newOpts = [...(sfObj.options || [])];
                                  newOpts.splice(optIdx, 1);
                                  newSF[sfIdx] = { ...sfObj, options: newOpts };
                                  updateQuestion(tab.id, q.id, 'subFields', newSF);
                                }}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded p-1 transition-colors shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button 
                            onClick={() => {
                              const newSF = [...(q.subFields || [])];
                              const newOpts = [...(sfObj.options || []), `Option ${(sfObj.options?.length || 0) + 1}`];
                              newSF[sfIdx] = { ...sfObj, options: newOpts };
                              updateQuestion(tab.id, q.id, 'subFields', newSF);
                            }}
                            className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 text-xs font-medium flex items-center mt-2 transition-colors"
                          >
                            <Plus className="w-3 h-3 mr-1" /> Add Option
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 mt-6">
                    <button 
                      onClick={() => {
                        if (sfIdx === 0) return;
                        const newSF = [...(q.subFields || [])];
                        [newSF[sfIdx - 1], newSF[sfIdx]] = [newSF[sfIdx], newSF[sfIdx - 1]];
                        updateQuestion(tab.id, q.id, 'subFields', newSF);
                      }}
                      disabled={sfIdx === 0}
                      className="p-1 h-fit text-gray-700 dark:text-gray-400 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-[#1C1C1E] rounded transition-colors disabled:opacity-30"
                      title="Move Up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        const newSF = [...(q.subFields || [])];
                        if (sfIdx === newSF.length - 1) return;
                        [newSF[sfIdx], newSF[sfIdx + 1]] = [newSF[sfIdx + 1], newSF[sfIdx]];
                        updateQuestion(tab.id, q.id, 'subFields', newSF);
                      }}
                      disabled={sfIdx === (q.subFields || []).length - 1}
                      className="p-1 h-fit text-gray-700 dark:text-gray-400 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-[#1C1C1E] rounded transition-colors disabled:opacity-30"
                      title="Move Down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        if (!window.confirm("Are you sure you want to delete this sub-field?")) return;
                        const newSF = [...(q.subFields || [])];
                        newSF.splice(sfIdx, 1);
                        updateQuestion(tab.id, q.id, 'subFields', newSF);
                      }}
                      className="p-1 h-fit text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors mt-2"
                      title="Delete Sub-field"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            <button 
              onClick={() => updateQuestion(tab.id, q.id, 'subFields', [...(q.subFields || []), { id: `sf_${generateShortId()}`, text: `Field ${(q.subFields?.length || 0) + 1}`, type: 'text', required: false }])}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center bg-white dark:bg-[#1C1C1E] px-4 py-2 rounded-lg border border-primary-200 dark:border-primary-800 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Sub-field
            </button>
          </div>
        )}

        {/* Depends On Engine */}
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 p-4 rounded-xl space-y-3">
          <label className="block text-xs font-semibold text-amber-800 dark:text-amber-400">Depends On (Boolean Expression)</label>
          <p className="text-xs text-amber-600/70 dark:text-amber-500/70">Use AND, OR, NOT, parenthesis, and == to build logic.</p>
          <textarea 
            rows={2}
            value={q.dependsOnExpression || ''}
            onChange={(e) => updateQuestion(tab.id, q.id, 'dependsOnExpression', e.target.value)}
            className="w-full bg-white dark:bg-[#0A0A0B] text-gray-900 dark:text-slate-100 border border-amber-200 dark:border-amber-700/50 rounded-lg px-3 py-2 text-sm font-mono focus:ring-amber-500 resize-y"
            placeholder="e.g. q_abc1 == &#34;Yes&#34; AND NOT (q_def2 == &#34;No&#34;)"
          />
          <div className="flex flex-col md:flex-row gap-2 items-start md:items-center bg-white/50 dark:bg-[#1C1C1E]/50 p-2 rounded-lg border border-amber-100 dark:border-amber-800/30">
            <select 
              value={helperQ}
              onChange={(e) => setHelperQ(e.target.value)}
              className="bg-white dark:bg-[#0A0A0B] text-gray-900 dark:text-slate-100 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-[#27272A] w-full md:w-auto"
            >
              <option value="">-- Select Question --</option>
              {allQuestions.filter((aq: any) => aq.id !== q.id).map((aq: any) => (
                <option key={aq.id} value={aq.id}>{aq.text.substring(0, 30)}{aq.text.length > 30 ? '...' : ''} ({aq.id})</option>
              ))}
            </select>
            
            {selectedHelperQ?.type === 'dynamic-list' && (
              <>
                <select
                  value={helperSubQ}
                  onChange={(e) => setHelperSubQ(e.target.value)}
                  className="bg-white dark:bg-[#0A0A0B] text-gray-900 dark:text-slate-100 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-[#27272A] w-full md:w-auto"
                >
                  <option value="">-- Sub-field --</option>
                  {(selectedHelperQ.subFields || []).map((sf: any) => (
                    <option key={sf.id} value={sf.id}>{sf.text.substring(0, 20)} ({sf.id})</option>
                  ))}
                </select>
                {helperSubQ && (
                  <select
                    value={helperFunc}
                    onChange={(e) => setHelperFunc(e.target.value)}
                    className="bg-white dark:bg-[#0A0A0B] text-gray-900 dark:text-slate-100 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-[#27272A] w-full md:w-auto"
                  >
                    <option value="SOME">If ANY row (SOME)</option>
                    <option value="EVERY">If ALL rows (EVERY)</option>
                  </select>
                )}
              </>
            )}

            {(helperQ && (!selectedHelperQ || selectedHelperQ.type !== 'dynamic-list' || helperSubQ)) && (
              <select
                value={helperOp}
                onChange={(e) => setHelperOp(e.target.value)}
                className="bg-white dark:bg-[#0A0A0B] text-gray-900 dark:text-slate-100 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-[#27272A] w-full md:w-auto"
              >
                <option value="==">==</option>
                <option value="!=">!=</option>
                <option value=">">&gt;</option>
                <option value=">=">&gt;=</option>
                <option value="<">&lt;</option>
                <option value="<=">&lt;=</option>
              </select>
            )}

            {(selectedHelperQ && selectedHelperQ.type !== 'dynamic-list' && (selectedHelperQ.type === 'radio' || selectedHelperQ.type === 'checkbox')) || 
             (selectedHelperSubQ && (selectedHelperSubQ.type === 'radio' || selectedHelperSubQ.type === 'checkbox')) ? (
              <select 
                value={helperVal}
                onChange={(e) => setHelperVal(e.target.value)}
                className="bg-white dark:bg-[#0A0A0B] text-gray-900 dark:text-slate-100 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-[#27272A] w-full md:w-auto"
              >
                <option value="">-- Select Value --</option>
                {((selectedHelperQ?.type === 'dynamic-list' ? selectedHelperSubQ?.options : selectedHelperQ?.options) || []).map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
                (helperQ && (!selectedHelperQ || selectedHelperQ.type !== 'dynamic-list' || helperSubQ)) && (
                  <input
                    type="text"
                    value={helperVal}
                    onChange={(e) => setHelperVal(e.target.value)}
                    placeholder="Value..."
                    className="bg-white dark:bg-[#0A0A0B] text-gray-900 dark:text-slate-100 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-[#27272A] w-full md:w-auto"
                  />
                )
            )}
            <button 
              onClick={handleInsertCondition}
              disabled={!helperQ}
              className="bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-800/30 dark:text-amber-300 dark:hover:bg-amber-800/50 px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50"
            >
              Insert Condition
            </button>
          </div>
        </div>
        
        <div className="text-right">
          <button 
            onClick={() => removeQuestion(tab.id, q.id)}
            className="text-red-500 hover:text-red-600 text-sm flex items-center gap-1 ml-auto font-medium"
          >
            <Trash2 className="w-4 h-4" /> Delete Question
          </button>
        </div>
      </div>
    </div>
  );
};

const QueueWidget = ({ pollJob }: { pollJob: (id: string) => void }) => {
  const [queue, setQueue] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isResuming, setIsResuming] = useState(false);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL;
        const res = await fetch(`${API_BASE_URL}/api/queue`, {
          headers: {
            'X-Instance-Id': getInstanceId()
          }
        });
        const data = await res.json();
        if (data.success) {
          const sortedQueue = (data.queue || []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setQueue(sortedQueue);
        }
      } catch (e) {
        console.error("Queue fetch error", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const runningCount = queue.filter(q => q.status === 'RUNNING').length;
  const queuedCount = queue.filter(q => q.status === 'QUEUED').length;

  // We no longer hide it completely, but make it compact when empty

  return (
    <div className="fixed top-4 right-6 z-[50] flex flex-col items-end">
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="mb-4 bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-[#27272A] rounded-2xl shadow-xl w-[calc(100vw-3rem)] sm:w-80 max-w-full overflow-hidden"
        >
          <div className="p-4 border-b border-gray-100 dark:border-[#27272A] bg-gray-50 dark:bg-[#0A0A0B] flex justify-between items-center">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 flex items-center">
              <ListOrdered className="w-4 h-4 mr-2" /> Instance Job History
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"><X className="w-4 h-4" /></button>
          </div>
          <div className="max-h-96 overflow-y-auto p-2 space-y-2">
            {queue.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No job history.</div>
            ) : (
              queue.map((job) => (
                <div 
                  key={job.session_id} 
                  onClick={() => pollJob(job.session_id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    job.status === 'RUNNING' 
                      ? 'bg-blue-50/50 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/10 dark:border-blue-800/30 dark:hover:bg-blue-900/30' 
                      : 'bg-white border-gray-100 hover:bg-gray-50 dark:bg-[#0A0A0B] dark:border-[#27272A] dark:hover:bg-[#1C1C1E]'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">ID: {(job.session_id.split('_')[2] === 'Compliance' ? job.session_id.split('_')[1] : job.session_id.split('_')[2]) || job.session_id.slice(0,6)} {job.status === 'RUNNING' ? '(Active)' : ''}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        job.status === 'RUNNING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
                        job.status === 'QUEUED' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}>
                        {job.status}
                      </span>
                      {(job.status === 'ORPHANED' || job.status === 'ERROR' || job.status === 'CANCELLED') && (
                        <button 
                          disabled={isResuming}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm("Warning: The AI form building process is time-consuming as it takes into account real EU regulation documents. As a result, it might generate costs and in some cases might not be successful. Do you want to proceed?")) return;
                            setIsResuming(true);
                            const API_BASE_URL = import.meta.env.VITE_API_URL;
                            try {
                              const res = await fetch(`${API_BASE_URL}/api/resume/${job.session_id}`, { method: 'POST' });
                              const data = await res.json();
                              if (data.status === 'resumed') {
                                pollJob(job.session_id);
                              }
                            } catch(err) {
                              console.error(err);
                            } finally {
                              setIsResuming(false);
                            }
                          }}
                          className={`p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-blue-500 transition-colors shrink-0 ${isResuming ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title="Resume Job"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const API_BASE_URL = import.meta.env.VITE_API_URL;
                          fetch(`${API_BASE_URL}/api/queue/${job.session_id}`, {
                            method: 'DELETE',
                            headers: { 'X-Instance-Id': getInstanceId() }
                          })
                            .then(() => setQueue(prev => prev.map(item => item.session_id === job.session_id ? { ...item, status: 'CANCELLED' } : item)))
                            .catch(console.error);
                        }}
                        className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded text-orange-500 transition-colors shrink-0"
                        title="Cancel Job"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const API_BASE_URL = import.meta.env.VITE_API_URL;
                          fetch(`${API_BASE_URL}/api/queue/${job.session_id}/remove`, {
                            method: 'DELETE',
                            headers: { 'X-Instance-Id': getInstanceId() }
                          })
                            .then(() => setQueue(prev => prev.filter(item => item.session_id !== job.session_id)))
                            .catch(console.error);
                        }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 transition-colors shrink-0"
                        title="Remove Job"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                    {job.celex_id}
                  </div>
                  <div className="text-xs text-slate-500 truncate w-full group-hover:text-violet-500/80 transition-colors">
                    {job.logs_count} log events • {formatDateYMD(new Date(job.created_at))}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
      <button 
        onClick={() => !isLoading && setIsOpen(!isOpen)}
        className={`bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-[#27272A] shadow-lg rounded-full flex items-center hover:shadow-xl transition-all ${isLoading ? 'opacity-80 cursor-wait px-4 py-3 gap-3' : (queue.length > 0 ? 'px-4 py-3 gap-3' : 'p-3')} `}
      >
        <div className="relative">
          {isLoading ? (
            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
          ) : (
            <ListOrdered className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          )}
          {(runningCount > 0 || queuedCount > 0) && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary-500 border-2 border-white dark:border-[#1C1C1E]"></span>
            </span>
          )}
        </div>
        <div className="flex flex-col items-start leading-tight">
          {(isLoading || queue.length > 0) && (
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
              {isLoading ? 'Connecting...' : (runningCount > 0 ? '1 Job Running' : (queuedCount > 0 ? 'Jobs Waiting' : 'No Active Jobs'))}
            </span>
          )}
          {(queuedCount > 0) && (
            <span className="text-[10px] text-gray-500 font-medium">
              {queuedCount} waiting
            </span>
          )}
        </div>
      </button>
    </div>
  )
}

const CodeSnippet = ({ code, language, defaultOpen = true, forceState, expandLevel = 3 }: { code: string, language: string, defaultOpen?: boolean, forceState?: any, expandLevel?: number }) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = (e: any) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <SmartDetails
      defaultOpen={defaultOpen}
      forceState={forceState}
      expandLevel={expandLevel}
      outerClassName="relative my-4 rounded-lg bg-[#0A0A0B] border border-gray-700/50 font-mono text-xs"
      headerClassName={(_isSticky: boolean, isOpen: boolean) => `flex items-center gap-2 px-4 py-2 bg-[#1C1C1E] text-gray-400 cursor-pointer transition-colors hover:bg-[#2C2C2E] ${isOpen ? 'sticky border-b border-gray-700/50 rounded-t-lg' : 'rounded-lg'}`}
      contentClassName="p-4 overflow-x-auto rounded-b-lg"
      icon={ChevronRight}
      title={
        <div className="flex items-center justify-between w-full min-w-0">
           <span className="font-semibold">{language.toUpperCase()}</span>
           <button onClick={handleCopy} className="text-gray-400 hover:text-white flex items-center gap-1 transition-colors shrink-0">
             {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
             {copied ? 'Copied' : 'Copy'}
           </button>
        </div>
      }
    >
      <pre className="text-gray-300 whitespace-pre"><code dangerouslySetInnerHTML={{ __html: code.replace(/</g, '&lt;').replace(/>/g, '&gt;') }} /></pre>
    </SmartDetails>
  );
};

const useStickyState = (topOffset: number) => {
  const [isSticky, setIsSticky] = React.useState(false);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    
    const container = sentinel.parentElement;
    if (!container) return;

    const root = sentinel.closest('.overscroll-contain') as Element; 
    if (!root) return;

    let sentinelIntersecting = true;
    let containerIntersecting = true;

    const updateState = () => {
      // It is sticky if the top sentinel is above the viewport (not intersecting)
      // AND the container is still partially in the viewport (intersecting)
      setIsSticky(!sentinelIntersecting && containerIntersecting);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === sentinel) {
            sentinelIntersecting = entry.isIntersecting;
          } else if (entry.target === container) {
            containerIntersecting = entry.isIntersecting;
          }
        }
        updateState();
      },
      {
        root,
        rootMargin: `-${topOffset}px 0px 0px 0px`,
        threshold: 0
      }
    );

    observer.observe(sentinel);
    observer.observe(container);
    return () => observer.disconnect();
  }, [topOffset]);

  return { sentinelRef, isSticky };
};

const SmartDetails = ({ title, defaultOpen = false, forceState, expandLevel = 3, children, icon: Icon = ChevronRight, topOffset, outerClassName, headerClassName, contentClassName, hideIcon = false }: any) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const contextOffset = React.useContext(StickyOffsetContext);
  const depth = React.useContext(StickyDepthContext);
  const actualTopOffset = contextOffset > 0 ? contextOffset : (topOffset !== undefined ? topOffset : 0);
  const { sentinelRef, isSticky } = useStickyState(actualTopOffset);
  const effectivelySticky = isSticky && isOpen;
  const headerRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = React.useState(0);

  const handleToggle = () => {
    if (isOpen && isSticky && containerRef.current) {
      const scrollParent = containerRef.current.closest('.overflow-y-auto, .overflow-auto') as HTMLElement;
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const childRect = containerRef.current.getBoundingClientRect();
        const targetTop = parentRect.top + actualTopOffset;
        scrollParent.scrollTop += (childRect.top - targetTop);
      }
    }
    setIsOpen(!isOpen);
  };

  React.useEffect(() => { 
    if (forceState && forceState.timestamp > 0) {
      setIsOpen(forceState.level >= expandLevel);
    } else if (!forceState) {
      setIsOpen(defaultOpen); 
    }
  }, [forceState, defaultOpen, expandLevel]);

  React.useEffect(() => {
    if (!headerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setHeaderHeight(entry.target.getBoundingClientRect().height);
      }
    });
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);
  
  return (
    <div ref={containerRef} className={`relative transition-all duration-200 ${outerClassName || 'rounded-lg bg-transparent border border-gray-200 dark:border-[#27272A]/50'}`}>
      <div ref={sentinelRef} className="absolute top-[-1px] left-0 w-full h-[1px] pointer-events-none" />
      <div 
        ref={headerRef}
        className={headerClassName ? headerClassName(effectivelySticky, isOpen) : `${isOpen ? 'sticky' : ''} flex items-center gap-2 p-3 cursor-pointer transition-colors ${
          effectivelySticky 
            ? 'bg-gray-50 dark:bg-[#1C1C1E] shadow-md border-b border-gray-200 dark:border-[#27272A]/50 rounded-t-lg' 
            : `bg-transparent hover:bg-gray-50 dark:hover:bg-[#1C1C1E] ${isOpen ? 'border-b border-gray-200 dark:border-[#27272A]/50 rounded-t-lg' : 'rounded-lg'}`
        }`}
        style={{ top: isOpen ? `${actualTopOffset}px` : undefined, zIndex: isOpen ? Math.max(10, 40 - depth) : 1 }}
        onClick={handleToggle}
      >
        {!hideIcon && (
          <div className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} shrink-0`}>
            <Icon className="w-4 h-4 text-gray-900 dark:text-white" />
          </div>
        )}
        <div className="font-medium text-sm flex-1 flex items-center min-w-0">{title}</div>
      </div>
      {isOpen && (
        <StickyOffsetContext.Provider value={actualTopOffset + headerHeight}>
          <StickyDepthContext.Provider value={depth + 1}>
            <div className={contentClassName || "py-4 pl-4"}>
              {children}
            </div>
          </StickyDepthContext.Provider>
        </StickyOffsetContext.Provider>
      )}
    </div>
  );
};

const IterationDetails = ({ title, defaultOpen = true, forceState, expandLevel = 1, children, icon: Icon = ChevronRight }: any) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const parentOffset = React.useContext(StickyOffsetContext);
  const depth = React.useContext(StickyDepthContext);
  const { sentinelRef, isSticky } = useStickyState(parentOffset);
  const effectivelySticky = isSticky && isOpen;
  const headerRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = React.useState(0);
  
  const handleToggle = () => {
    if (isOpen && isSticky && containerRef.current) {
      const scrollParent = containerRef.current.closest('.overflow-y-auto, .overflow-auto') as HTMLElement;
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const childRect = containerRef.current.getBoundingClientRect();
        const targetTop = parentRect.top + parentOffset;
        scrollParent.scrollTop += (childRect.top - targetTop);
      }
    }
    setIsOpen(!isOpen);
  };
  
  React.useEffect(() => { 
    if (forceState && forceState.timestamp > 0) {
      setIsOpen(forceState.level >= expandLevel);
    } else if (!forceState) {
      setIsOpen(defaultOpen); 
    }
  }, [forceState, defaultOpen, expandLevel]);

  React.useEffect(() => {
    if (!headerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setHeaderHeight(entry.target.getBoundingClientRect().height);
      }
    });
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);
  
  return (
    <div ref={containerRef} className={`relative rounded-lg transition-all duration-200 bg-transparent`}>
      <div ref={sentinelRef} className="absolute top-[-1px] left-0 w-full h-[1px] pointer-events-none" />
      <div 
        ref={headerRef}
        className={`${isOpen ? 'sticky' : ''} flex items-center gap-2 p-3 cursor-pointer transition-colors ${
          effectivelySticky 
            ? 'bg-gray-50 dark:bg-[#1C1C1E] shadow-md border-b border-gray-200 dark:border-[#27272A]/50 rounded-t-lg' 
            : `bg-white dark:bg-[#0A0A0B] hover:bg-gray-50 dark:hover:bg-[#1C1C1E] ${isOpen ? 'border-b border-gray-200 dark:border-[#27272A]/50 rounded-t-lg' : 'rounded-lg shadow-sm'}`
        }`}
        style={{ top: isOpen ? `${parentOffset}px` : undefined, zIndex: isOpen ? Math.max(10, 40 - depth) : 1 }}
        onClick={handleToggle}
      >
        <div className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
          <Icon className="w-4 h-4 text-gray-900 dark:text-white" />
        </div>
        <div className="font-medium text-sm text-gray-900 dark:text-white flex-1 flex items-center min-w-0">{title}</div>
      </div>
      {isOpen && (
        <StickyOffsetContext.Provider value={parentOffset + headerHeight}>
          <StickyDepthContext.Provider value={depth + 1}>
            <div className="pb-4 rounded-b-lg">
              {children}
            </div>
          </StickyDepthContext.Provider>
        </StickyOffsetContext.Provider>
      )}
    </div>
  );
};

export const formatDuration = (diffSec: number, toFixedValue: number = 1): string => {
  if (diffSec >= 3600) {
    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const seconds = Math.floor(diffSec % 60);
    return `(${hours}h ${minutes}m ${seconds}s)`;
  } else if (diffSec >= 60) {
    const minutes = Math.floor(diffSec / 60);
    const seconds = Math.floor(diffSec % 60);
    return `(${minutes}m ${seconds}s)`;
  }
  return `(${diffSec.toFixed(toFixedValue)}s)`;
};

const LiveDuration = ({ startTime, isActive }: { startTime: Date, isActive: boolean }) => {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [isActive]);
  
  if (!isActive) return <span className="text-gray-500 font-normal ml-1">(Stopped)</span>;
  
  const diffSec = Math.max(0, (now.getTime() - startTime.getTime()) / 1000);
  return <span className="text-gray-500 font-normal ml-1">{formatDuration(diffSec, 0)}</span>;
};

const FormattedChunk = ({ text, forceState, expandLevel = 4, defaultOpen = false }: { text: string, forceState?: any, expandLevel?: number, defaultOpen?: boolean }) => {
  if (!text) return null;
  const parts = text.split(/(```[\s\S]*?```)/i);
  return (    <div className="text-gray-900 dark:text-slate-100 font-sans leading-relaxed text-sm space-y-2">
      {parts.map((part, i) => {
        if (!part.trim()) return null;
        if (part.startsWith('```')) {
          // Extract language and code, handling both multi-line and single-line
          const match = part.match(/^```([a-zA-Z0-9_]*)[ \t]*\n?([\s\S]*?)```$/i);
          if (match) {
            const lang = match[1] || 'code';
            let code = match[2];
            if (!code.trim()) return null;
            // If the code still starts with something that looks like inline json due to lack of newline
            if (!lang && code.trim().startsWith('json {')) {
               code = code.trim().substring(4).trim();
               return <CodeSnippet key={i} code={code} language="json" defaultOpen={defaultOpen} forceState={forceState} expandLevel={expandLevel} />;
            }
            return <CodeSnippet key={i} code={code.trim()} language={lang} defaultOpen={defaultOpen} forceState={forceState} expandLevel={expandLevel} />;
          }
        }
        return part.trim() ? (
          <div key={i}>
            <ReactMarkdown
              components={{
                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2" {...props} />,
                li: ({node, ...props}) => <li className="mb-1" {...props} />,
                h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-md font-bold mb-2" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-1" {...props} />,
                a: ({node, ...props}) => <a className="text-blue-500 hover:underline" {...props} />,
                code: ({node, inline, ...props}: any) => inline ? <code className="bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 font-mono text-xs" {...props} /> : <code {...props} />,
              }}
            >
              {part}
            </ReactMarkdown>
          </div>
        ) : null;
      })}
    </div>
  );
};

const SwarmTimer = ({ logs, isBuildingForm, serverTimeOffset }: { logs: any[], isBuildingForm: boolean, serverTimeOffset: number }) => {
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (isBuildingForm) {
      const i = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(i);
    }
  }, [isBuildingForm]);

  const validLogs = (logs || []).filter(l => l.timestamp || l.type === 'ERROR');
  if (validLogs.length === 0) return null;

  let totalElapsed = 0;
  let lastTime = 0;

  for (const log of validLogs) {
    const t = parseServerTimestamp(log.timestamp).getTime();
    if (isNaN(t)) continue;
    if (lastTime === 0) {
      lastTime = t;
    } else {
      const gap = t - lastTime;
      if (gap > 0 && gap < 15 * 60 * 1000) totalElapsed += gap;
      lastTime = t;
    }
  }

  if (isBuildingForm && lastTime > 0) {
    const currentServerTime = now - serverTimeOffset;
    const liveGap = currentServerTime - lastTime;
    // Only add live gap if it's positive and not a massive sleep gap
    if (liveGap > 0 && liveGap < 15 * 60 * 1000) {
      totalElapsed += liveGap;
    }
  }

  if (totalElapsed < 0) totalElapsed = 0;

  const totalSeconds = Math.floor(totalElapsed / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let timeString = '';
  if (hours > 0) timeString += `${hours}h `;
  if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
  timeString += `${seconds}s`;

  return (
    <div className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 px-3 py-1.5 bg-gray-100 dark:bg-[#1C1C1E] rounded-lg border border-gray-200 dark:border-[#27272A]/50 shrink-0">
      <Clock className="w-4 h-4" />
      <span>{timeString}</span>
    </div>
  );
};

const SwarmLogViewer = ({ logs, isBuildingForm, forceState, autoScrollEnabled = true, scrollDuration = 300 }: { logs: any[], isBuildingForm: boolean, forceState?: {level: number, timestamp: number}, autoScrollEnabled?: boolean, scrollDuration?: number }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const prevIsBuildingForm = React.useRef(isBuildingForm);

  // Auto-scroll to bottom nicely when building, including the final transition
  React.useEffect(() => {
    if ((isBuildingForm || prevIsBuildingForm.current) && containerRef.current && autoScrollEnabled) {
      const el = containerRef.current;
      
      const customScrollToBottom = (duration: number) => {
        const start = el.scrollTop;
        const target = el.scrollHeight - el.clientHeight;
        const change = target - start;
        if (change <= 0) return;

        const startTime = performance.now();
        const animateScroll = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease-out quadratic
          const ease = progress * (2 - progress);
          el.scrollTop = start + change * ease;
          if (progress < 1) {
            requestAnimationFrame(animateScroll);
          }
        };
        requestAnimationFrame(animateScroll);
      };

      // Use requestAnimationFrame to wait for any DOM updates/transitions to start
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (scrollDuration > 500) {
            customScrollToBottom(scrollDuration);
          } else {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }
        }, 300); // slight delay to allow SmartDetails animation to update scrollHeight
      });
    }
    prevIsBuildingForm.current = isBuildingForm;
  }, [logs, isBuildingForm, autoScrollEnabled, scrollDuration]);

  const groupedLogs: any[] = [];
  let currentIteration: any = null;
  let currentTab: any = null;

  logs.forEach((log, index) => {
    log._originalIndex = index;
    const isTabStart = log.type === 'TAB_START';

    if (isTabStart) {
      if (currentIteration) {
        if (currentTab) currentTab.items.push(currentIteration);
        else groupedLogs.push(currentIteration);
        currentIteration = null;
      }
      if (currentTab) {
        groupedLogs.push(currentTab);
      }
      currentTab = { type: 'TAB_GROUP', startLog: log, items: [] };
    } else if (log.type === 'ITERATION_START') {
      if (currentIteration) {
        if (currentTab) currentTab.items.push(currentIteration);
        else groupedLogs.push(currentIteration);
      }
      currentIteration = { type: 'ITERATION_GROUP', startLog: log, items: [], endLog: null };
    } else if (log.type === 'CONSENSUS_REACHED' || log.type === 'ITERATION_END') {
      if (currentIteration) {
        currentIteration.endLog = log;
        if (currentTab) currentTab.items.push(currentIteration);
        else groupedLogs.push(currentIteration);
        currentIteration = null;
      } else {
        if (currentTab) currentTab.items.push(log);
        else groupedLogs.push(log);
      }
    } else if (log.type === 'TAB_END') {
      if (currentIteration) {
        if (currentTab) currentTab.items.push(currentIteration);
        else groupedLogs.push(currentIteration);
        currentIteration = null;
      }
      if (currentTab) {
        currentTab.endLog = log;
        groupedLogs.push(currentTab);
        currentTab = null;
      }
    } else if (log.type === 'ERROR' || log.type === 'HITL_REQUIRED') {
      if (currentIteration) {
        currentIteration.endLog = log;
        if (currentTab) currentTab.items.push(currentIteration);
        else groupedLogs.push(currentIteration);
        currentIteration = null;
      }
      if (currentTab) {
        currentTab.endLog = log;
        groupedLogs.push(currentTab);
        currentTab = null;
      }
      groupedLogs.push(log);
    } else if (log.type === 'SUCCESS' || log.type === 'META_CONCLUSION') {
      if (currentIteration) {
        if (currentTab) currentTab.items.push(currentIteration);
        else groupedLogs.push(currentIteration);
        currentIteration = null;
      }
      if (currentTab) {
        groupedLogs.push(currentTab);
        currentTab = null;
      }
      groupedLogs.push(log);
    } else {
      if (currentIteration) {
        currentIteration.items.push(log);
      } else if (currentTab) {
        currentTab.items.push(log);
      } else {
        groupedLogs.push(log);
      }
    }
  });

  if (currentIteration) {
    if (currentTab) currentTab.items.push(currentIteration);
    else groupedLogs.push(currentIteration);
  }
  if (currentTab) {
    groupedLogs.push(currentTab);
  }

  const renderLog = (log: any, i: number, options: { topOffset?: number } = {}) => {
          if (log.type === 'ITERATION_END' || log.type === 'TAB_START' || log.type === 'TAB_END') return null;
          if (log.type === 'ITERATION_START') {
            return (
              <div key={i} className="flex items-center gap-2 bg-transparent p-3 rounded-lg border border-gray-200 dark:border-[#27272A]/50">
                <RefreshCw className="w-4 h-4 text-gray-900 dark:text-white" />
                <span className="font-medium text-sm text-gray-900 dark:text-white">Iteration {log.payload.iteration}</span>
              </div>
            );
          }
          if (log.type === 'SYNTAX_FAIL') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            return (
              <SmartDetails
                key={i}
                topOffset={options.topOffset}
                title={
                  <div className="flex items-center gap-3 w-full justify-between min-w-0">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">Syntax Check</span>
                      {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-12 flex justify-end">
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                          FAIL
                        </span>
                      </div>
                      {ts && <span className="hidden sm:flex w-24 justify-end text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                    </div>
                  </div>
                }
                forceState={forceState}
              >
                <div className="text-sm text-gray-900 dark:text-white font-mono whitespace-pre-wrap">
                  {log.payload.errors}
                </div>
              </SmartDetails>
            );
          }
          if (log.type === 'SYNTAX_PASS') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            return (
              <div key={i} className="flex items-center justify-between p-3 bg-transparent border border-gray-200 dark:border-[#27272A]/50 rounded-lg min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Check className="w-4 h-4 text-gray-900 dark:text-white shrink-0" />
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">Syntax Check</span>
                      {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-gray-900 dark:text-white font-medium text-sm tracking-wide w-10 text-right">PASS</span>
                  {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                </div>
              </div>
            );
          }
          if (log.type === 'CONSENSUS_FAILED') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            const currentIterationLogs = logs.slice(0, log._originalIndex).reverse();
            const iterStartIdx = currentIterationLogs.findIndex((l: any) => l.type === 'ITERATION_START');
            const iterLogs = iterStartIdx >= 0 ? currentIterationLogs.slice(0, iterStartIdx).reverse() : currentIterationLogs.slice().reverse();
            



            const stats: Record<string, { total: number, passed: number, defects: number }> = {};
            iterLogs.forEach((l: any) => {
              if (l.type === 'AGENT_CHUNK') {
                const chunkAgentName = l.payload?.agent || l.agent;
                if (!chunkAgentName || !chunkAgentName.toLowerCase().includes('critique')) return;
                
                const content = l.payload?.conclusion || l.chunk || l.payload?.chunk || '';
                const contentStr = (content || '').trim();
                
                const isPassOnly = contentStr.startsWith('PASS') || contentStr.includes('"defect_count": 0');
                let defectCount = 0;
                const dm = contentStr.match(/"defect_count"\s*:\s*(\d+)/);
                if (dm) {
                  defectCount = parseInt(dm[1], 10);
                } else if (!isPassOnly) {
                  defectCount = 1;
                }
                
                const isPass = isPassOnly || defectCount === 0;
                
                const baseName = chunkAgentName.replace(/\s*\d+\/\d+/g, '').replace(/\s*\(.*\)/g, '').trim();
                if (!stats[baseName]) {
                  stats[baseName] = { total: 0, passed: 0, defects: 0 };
                }
                stats[baseName].total += 1;
                if (isPass) {
                  stats[baseName].passed += 1;
                }
                stats[baseName].defects += defectCount;
              }
            });
            
            let totalDefects = 0;
            const statsStr = Object.entries(stats)
              .map(([name, stat]) => {

                totalDefects += stat.defects;
                return `${name}: ${stat.passed}/${stat.total} passed (${stat.defects} defects)`;
              })
              .join('\n') + (totalDefects > 0 ? `\nTotal defects: ${totalDefects}` : '');

            return (
              <div key={i} className="flex flex-col gap-1 bg-transparent p-3 rounded-lg border border-gray-200 dark:border-[#27272A]/50">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-gray-900 dark:text-white" />
                    <span className="font-medium text-sm text-gray-900 dark:text-white">Consensus (Iteration {log.payload.iteration})</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-gray-900 dark:text-white font-medium text-sm tracking-wide w-10 text-right">FAIL</span>
                    {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                  </div>
                </div>
                {statsStr && (
                  <div className="text-xs text-gray-500 dark:text-slate-400 pl-6 whitespace-pre-wrap">
                    {statsStr}
                  </div>
                )}
              </div>
            );
          }
          if (log.type === 'CONSENSUS_REACHED') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            return (
              <div key={i} className="flex items-center justify-between p-4 bg-transparent border border-gray-200 dark:border-[#27272A]/50 rounded-xl mt-8 shadow-lg min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Check className="w-5 h-5 text-gray-900 dark:text-white shrink-0" />
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-bold text-sm text-gray-900 dark:text-white truncate">Consensus Reached! Finalizing schema...</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-gray-900 dark:text-white font-medium text-sm tracking-wide w-10 text-right">PASS</span>
                  {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                </div>
              </div>
            );
          }
          if (log.type === 'AGENT_CHUNK' || log.type === 'AGENT_CONCLUSION') {
            const isConclusion = log.type === 'AGENT_CONCLUSION';
            const agentName = log.payload?.agent || log.agent;
            const content = log.payload?.conclusion || log.chunk;
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            const contentTrimmed = (content || '').trim();
            const isPassOnly = contentTrimmed.startsWith('PASS') || contentTrimmed.includes('"defect_count": 0');
            let defectCount = 0;
            const defectMatch = contentTrimmed.match(/"defect_count"\s*:\s*(\d+)/);
            if (defectMatch) {
              defectCount = parseInt(defectMatch[1], 10);
            }

            const isCritique = agentName.toLowerCase().includes('critique');
            let isPass: boolean = isPassOnly;
            let isFail = isCritique && !isPassOnly;
            let agentStatsStr = '';

            if (isConclusion && isCritique) {
              const currentIterationLogs = logs.slice(0, log._originalIndex).reverse();
              const iterStartIdx = currentIterationLogs.findIndex((l: any) => l.type === 'ITERATION_START');
              const iterLogs = iterStartIdx >= 0 ? currentIterationLogs.slice(0, iterStartIdx) : currentIterationLogs;
              
              let total = 0;
              let passed = 0;
              let chunkDefects = 0;
              iterLogs.forEach((l: any) => {
                if (l.type === 'AGENT_CHUNK') {
                  const chunkAgentName = l.payload?.agent || l.agent;
                  const chunkBaseName = chunkAgentName.replace(/\s*\d+\/\d+/g, '').replace(/\s*\(.*\)/g, '').trim();
                  const expectedBaseName = agentName.replace(' Conclusion', '').trim();
                  if (chunkAgentName && chunkBaseName === expectedBaseName) {
                    const chunkContent = l.payload?.conclusion || l.chunk;
                    const chunkStr = (chunkContent || '').trim();
                    const chunkIsPass = chunkStr.startsWith('PASS') || chunkStr.includes('"defect_count": 0');
                    total += 1;
                    if (chunkIsPass) passed += 1;
                    const dm = chunkStr.match(/"defect_count"\s*:\s*(\d+)/);
                    if (dm) chunkDefects += parseInt(dm[1], 10);
                  }
                }
              });
              
              if (total > 0) {
                agentStatsStr = `${passed}/${total} passed`;
                isPass = passed === total;
                isFail = passed < total;
                defectCount = chunkDefects;
              }
            }

            if (isPass) {
              return (
                <div key={i} className="flex items-center justify-between p-3 bg-transparent border border-gray-200 dark:border-[#27272A]/50 rounded-lg min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Check className="w-4 h-4 text-gray-900 dark:text-white shrink-0" />
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{isConclusion ? `${agentName} Conclusion` : agentName}</span>
                    {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-gray-900 dark:text-white font-medium text-sm tracking-wide w-10 text-right">PASS</span>
                    {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                  </div>
                </div>
              );
            }

            return (
              <SmartDetails 
                key={i} 
                topOffset={options.topOffset}
                title={<div className="flex items-center justify-between w-full min-w-0 gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{isConclusion ? `${agentName} Conclusion` : agentName}</span>
                    {(agentStatsStr || isFail) && <span className="text-xs text-gray-500 dark:text-slate-400 font-mono">
                      {agentStatsStr ? (isFail ? `${agentStatsStr} (${defectCount} defects)` : agentStatsStr) : `(${defectCount} defects)`}
                    </span>}
                    {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {isPass && isConclusion && <span className="text-gray-900 dark:text-white font-medium text-sm tracking-wide w-10 text-right">PASS</span>}
                    {isFail && <span className="text-gray-900 dark:text-white font-medium text-sm tracking-wide w-10 text-right">FAIL</span>}
                    {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                  </div>
                </div>}
                forceState={forceState}
              >
                <div className="text-slate-800 dark:text-slate-200">
                  <FormattedChunk text={content} forceState={forceState} />
                </div>
              </SmartDetails>
            );
          }
          if (log.type === 'SUCCESS') {
            return (
              <div key={i} className="mt-10 p-8 bg-transparent border border-gray-200 dark:border-[#27272A]/50 rounded-2xl text-gray-900 dark:text-white font-sans shadow-xl text-center">
                <Sparkles className="w-10 h-10 mx-auto mb-4 text-gray-900 dark:text-white" />
                <div className="font-bold text-2xl">{log.payload.message}</div>
                <div className="text-xs italic mt-6 opacity-80 pt-4 border-t border-gray-200 dark:border-[#27272A]/50 max-w-md mx-auto">
                  Disclaimer: This is an AI-generated response. It may contain inaccuracies.
                </div>
              </div>
            );
          }
          if (log.type === 'HITL_REQUIRED') {
            return <div key={i} className="text-amber-600 dark:text-amber-400 font-bold text-lg mt-6 bg-amber-50 dark:bg-amber-950/30 p-5 rounded-xl border border-amber-300 dark:border-amber-900/50 shadow-md">HITL Required: {log.payload.message}</div>;
          }
          if (log.type === 'META_CONCLUSION_GROUP') {
            return (
              <IterationDetails
                key={i}
                title={
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-emerald-500" />
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Self Improvement Insights</span>
                  </div>
                }
                defaultOpen={true}
                expandLevel={1}
                forceState={forceState}
              >
                <div className="text-slate-800 dark:text-slate-200 mt-2">
                  <CodeSnippet 
                    code={log.payload.fullText || ''} 
                    language="markdown" 
                    defaultOpen={true} 
                    expandLevel={1} 
                    forceState={forceState}
                  />
                </div>
              </IterationDetails>
            );
          }
          if (log.type === 'META_CONCLUSION') {
            return (
              <SmartDetails
                key={i}
                outerClassName="mt-8 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl shadow-lg transition-all duration-200"
                headerClassName={(isSticky: boolean, isOpen: boolean) => `${isOpen ? 'sticky' : ''} flex items-center gap-2 p-6 cursor-pointer transition-colors ${
                  isSticky 
                    ? 'bg-emerald-50 dark:bg-emerald-950/90 shadow-md border-b border-emerald-200 dark:border-emerald-800/50 rounded-t-2xl' 
                    : `bg-transparent hover:bg-emerald-100/50 dark:hover:bg-emerald-900/50 ${isOpen ? 'border-b border-emerald-200 dark:border-emerald-800/50 rounded-t-2xl' : 'rounded-2xl'}`
                }`}
                contentClassName="p-6 pt-0"
                defaultOpen={true}
                expandLevel={1}
                icon={ChevronRight}
                title={
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                      <BrainCircuit className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h4 className="font-bold text-lg text-emerald-800 dark:text-emerald-300">{log.payload.title || "Self Improvement Insights"}</h4>
                  </div>
                }
              >
                <div className="text-slate-800 dark:text-slate-200 mt-4">
                  <FormattedChunk text={log.payload.conclusion} forceState={forceState} defaultOpen={true} expandLevel={1} />
                </div>
              </SmartDetails>
            );
          }
          if (log.type === 'ERROR') {
            return (
              <div key={i} className="bg-transparent border border-gray-200 dark:border-[#27272A]/50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-gray-900 dark:text-white"/>
                  <span className="font-medium text-sm text-gray-900 dark:text-white">Error</span>
                </div>
                <div className="text-sm text-gray-900 dark:text-white">{log.payload?.message || JSON.stringify(log.payload)}</div>
              </div>
            );
          }
          if (log.type === 'AGENT_START') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            const agentName = log.payload?.agent;
            const isFinished = agentName && logs.slice(log._originalIndex + 1).some((l: any) => 
               (l.type === 'AGENT_END' || l.type === 'AGENT_CHUNK' || l.type === 'AGENT_CONCLUSION' || l.type === 'HITL_REQUIRED') && 
               (l.payload?.agent === agentName || l.agent === agentName)
            );
            return (
              <div key={i} className="flex items-center justify-between bg-transparent p-3 rounded-lg border border-gray-200 dark:border-[#27272A]/50">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-gray-900 dark:text-white"/>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      Agent Started: {agentName || 'Unknown'}
                      {!isFinished && log.timestamp && <LiveDuration startTime={parseServerTimestamp(log.timestamp)} isActive={isBuildingForm} />}
                    </span>
                    {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                  </div>
                </div>
                {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
              </div>
            );
          }
          if (log.type === 'AGENT_END') {
            const startLog = logs.slice(0, log._originalIndex).reverse().find((l: any) => l.type === 'AGENT_START' && l.payload?.agent === log.payload?.agent);
            let durationStr = '';
            if (startLog && startLog.timestamp && log.timestamp) {
              const diffMs = parseServerTimestamp(log.timestamp).getTime() - parseServerTimestamp(startLog.timestamp).getTime();
              const diffSec = diffMs / 1000;
              durationStr = formatDuration(diffSec, 1);
            }
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            return (
              <div key={i} className="flex items-center justify-between bg-transparent p-3 rounded-lg border border-gray-200 dark:border-[#27272A]/50">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-gray-900 dark:text-white"/>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">Agent Finished: {log.payload?.agent || 'Unknown'}{durationStr && <span className="text-gray-500 font-normal ml-1">{durationStr}</span>}</span>
                    {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                  </div>
                </div>
                {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
              </div>
            );
          }
          if (log.type === 'START' || log.type === 'INFO') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            const payloadText = typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload);
            return <div key={i} className="flex items-center justify-between bg-transparent p-3 rounded-lg border border-gray-200 dark:border-[#27272A]/50">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-900 dark:text-white"/>
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{payloadText}</span>
                  {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                </div>
              </div>
              {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
            </div>;
          }
          if (log.type === 'ROLLBACK') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            return (
              <SmartDetails
                key={i}
                topOffset={options.topOffset}
                title={
                  <div className="flex items-center gap-3 w-full justify-between min-w-0">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">Rollback Triggered</span>
                      {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-12 flex justify-end"></div>
                      {ts && <span className="hidden sm:flex w-24 justify-end text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                    </div>
                  </div>
                }
                forceState={forceState}
              >
                <div className="text-sm text-gray-900 dark:text-white font-mono whitespace-pre-wrap">
                  {log.payload?.reason || log.payload?.message || JSON.stringify(log.payload)}
                </div>
              </SmartDetails>
            );
          }
          if (log.type === 'ERROR') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            const errorMessage = log.payload?.message || log.payload || "Unknown error";
            return (
              <div key={i} className="flex items-center justify-between bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-medium text-sm text-red-600 dark:text-red-400 truncate">Error: {errorMessage}</span>
                    {ts && <span className="sm:hidden text-xs font-normal text-red-500 dark:text-red-400 font-mono bg-red-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                  </div>
                </div>
                {ts && <span className="hidden sm:flex text-xs font-normal text-red-500 dark:text-red-400 font-mono bg-red-500/10 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
              </div>
            );
          }
          if (log.type === 'COMPLETED' || log.type === 'COMPLETE') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            return (
              <SmartDetails
                key={i}
                topOffset={options.topOffset}
                title={
                  <div className="flex items-center gap-3 w-full justify-between min-w-0">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-medium text-sm text-green-600 dark:text-green-400 truncate">Job Completed: {log.payload?.message || "Finished successfully"}</span>
                      {ts && <span className="sm:hidden text-xs font-normal text-green-500 dark:text-green-400 font-mono bg-green-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-12 flex justify-end"></div>
                      {ts && <span className="hidden sm:flex w-24 justify-end text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-green-500/10 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                    </div>
                  </div>
                }
                forceState={forceState}
              >
                <div className="text-sm text-gray-900 dark:text-white space-y-2">
                  {log.payload?.last_json && (
                    <div className="mt-2">
                      <div className="text-slate-600 dark:text-slate-400 font-bold mb-1">Final JSON Schema:</div>
                      <CodeSnippet code={log.payload.last_json} language="json" forceState={forceState} expandLevel={3} />
                    </div>
                  )}
                  {!log.payload?.last_json && (
                    <div>{JSON.stringify(log.payload)}</div>
                  )}
                </div>
              </SmartDetails>
            );
          }
          if (log.type === 'PATCH_FAIL') {
            const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
            return (
              <SmartDetails
                key={i}
                topOffset={options.topOffset}
                title={
                  <div className="flex items-center gap-3 w-full justify-between min-w-0">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">JSON Builder (Syntax Patch)</span>
                      {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-12 flex justify-end">
                        <span className="text-gray-900 dark:text-white font-medium text-sm tracking-wide">FAIL</span>
                      </div>
                      {ts && <span className="hidden sm:flex w-24 justify-end text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                    </div>
                  </div>
                }
                forceState={forceState}
              >
                <div className="text-sm text-gray-900 dark:text-white font-mono whitespace-pre-wrap space-y-2">
                  <div><span className="text-red-600 dark:text-red-400 font-bold">Error:</span> {log.payload?.error}</div>
                  {log.payload?.patch_str && (
                    <div>
                      <div className="text-slate-600 dark:text-slate-400 font-bold mb-1">Patch Attempted:</div>
                      <div className="bg-gray-100 dark:bg-[#0A0A0B] p-2 rounded border border-gray-700/50 text-xs overflow-x-auto">
                        {log.payload.patch_str}
                      </div>
                    </div>
                  )}
                  {!log.payload?.error && !log.payload?.patch_str && (
                    <div>{JSON.stringify(log.payload)}</div>
                  )}
                </div>
              </SmartDetails>
            );
          }
          const payloadDisplay = typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload);
          const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
          return (
            <div key={i} className="flex items-center justify-between bg-transparent p-3 rounded-lg border border-gray-200 dark:border-[#27272A]/50">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-[#1C1C1E] text-gray-600 dark:text-slate-400">{log.type}</span>
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{payloadDisplay}</span>
                  {ts && <span className="sm:hidden text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex w-fit items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                </div>
              </div>
              {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded flex items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
            </div>
          );
  };

  const renderIterationGroup = (group: any, groupIndex: string | number) => {
    let startTime = group.startLog?.timestamp ? parseServerTimestamp(group.startLog.timestamp).getTime() : 0;
    let endTime = 0;
    if (group.endLog?.timestamp) {
       endTime = parseServerTimestamp(group.endLog.timestamp).getTime();
    } else if (group.items.length > 0) {
       const lastWithTs = group.items.slice().reverse().find((l: any) => l.timestamp);
       if (lastWithTs) endTime = parseServerTimestamp(lastWithTs.timestamp).getTime();
    } else {
       endTime = startTime;
    }
    
    let durationStr = '';
    if (startTime && endTime && endTime >= startTime) {
       const diffSec = (endTime - startTime) / 1000;
       durationStr = formatDuration(diffSec, 1);
    }



    let statsStr = '';
    const stats: Record<string, { total: number, passed: number, defects: number }> = {};
    group.items.forEach((l: any) => {
      if (l.type === 'AGENT_CHUNK') {
        const chunkAgentName = l.payload?.agent || l.agent;
        if (!chunkAgentName || !chunkAgentName.toLowerCase().includes('critique')) return;
        
        const content = l.payload?.conclusion || l.chunk || l.payload?.chunk || '';
        const contentStr = (content || '').trim();
        
        const isPassOnly = contentStr.startsWith('PASS') || contentStr.includes('"defect_count": 0');
        let defectCount = 0;
        const dm = contentStr.match(/"defect_count"\s*:\s*(\d+)/);
        if (dm) {
          defectCount = parseInt(dm[1], 10);
        } else if (!isPassOnly) {
          defectCount = 1;
        }
        
        const isPass = isPassOnly || defectCount === 0;
        
        const baseName = chunkAgentName.replace(/\s*\d+\/\d+/g, '').replace(/\s*\(.*\)/g, '').trim();
        if (!stats[baseName]) {
          stats[baseName] = { total: 0, passed: 0, defects: 0 };
        }
        stats[baseName].total += 1;
        if (isPass) {
          stats[baseName].passed += 1;
        }
        stats[baseName].defects += defectCount;
      }
    });
    let totalDefects = 0;
    statsStr = Object.entries(stats)
      .map(([name, stat]) => {

        totalDefects += stat.defects;
        return `${name}: ${stat.passed}/${stat.total} passed (${stat.defects} defects)`;
      })
      .join('\n');
    if (totalDefects > 0) {
      statsStr += `\nTotal defects: ${totalDefects}`;
    }

    const isLive = !group.endLog && isBuildingForm && group.startLog?.timestamp;

    const logForTs = group.endLog || group.startLog;
    const ts = logForTs?.timestamp ? formatDateYMD(parseServerTimestamp(logForTs.timestamp)) : '';

    return (
      <div key={`iter-${groupIndex}`} className="space-y-2">
        <IterationDetails
          expandLevel={2}
          title={
            <div className="flex flex-col gap-0.5 min-w-0 w-full">
              <div className="flex items-center justify-between min-w-0 w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <RefreshCw className="w-4 h-4 text-gray-900 dark:text-white shrink-0" />
                  <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                    Iteration {group.startLog.payload.iteration}
                    {durationStr && !isLive && <span className="text-gray-500 font-normal ml-1">{durationStr}</span>}
                    {isLive && (
                      <LiveDuration startTime={new Date(parseServerTimestamp(group.startLog.timestamp).getTime())} isActive={isBuildingForm} />
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                </div>
              </div>
              {statsStr && (
                <div className="text-[11px] text-gray-500 dark:text-slate-400 pl-6 whitespace-pre-wrap">
                  {statsStr}
                </div>
              )}
            </div>
          }
          forceState={forceState}
        >
          {group.items.length > 0 && (
            <div className="flex relative mt-1">
              <div className="flex-1 space-y-2 min-w-0 pl-4">
                {group.items.map((item: any) => renderLog(item, item._originalIndex))}
              </div>
            </div>
          )}
          {group.endLog && (
            <div className="mt-2">
              {renderLog(group.endLog, group.endLog._originalIndex)}
            </div>
          )}
        </IterationDetails>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-transparent font-sans">
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-6 space-y-2" ref={containerRef}>
        {groupedLogs.map((group, groupIndex) => {
          if (group.type === 'TAB_GROUP') {
            const tabName = group.startLog.payload?.tab_id || 'Unknown Tab';
            const tabIndex = group.startLog.payload?.tab_index;
            const totalTabs = group.startLog.payload?.total_tabs;
            const indexStr = tabIndex && totalTabs ? ` (${tabIndex}/${totalTabs})` : '';
            let durationStr = '';
            const endTimestamp = group.endLog?.timestamp || (group.items.length > 0 ? group.items[group.items.length - 1].timestamp : null);
            if (group.startLog.timestamp && endTimestamp) {
              const diffMs = parseServerTimestamp(endTimestamp).getTime() - parseServerTimestamp(group.startLog.timestamp).getTime();
              const diffSec = diffMs / 1000;
              if (diffSec >= 0) {
                durationStr = formatDuration(diffSec, 1);
              }
            }
            const isLive = !group.endLog && isBuildingForm && group.startLog?.timestamp;

            let statusBadge = null;
            if (group.endLog) {
              const isPass = group.endLog.type === 'TAB_END';
              statusBadge = (
                <span className="text-gray-900 dark:text-white font-medium text-sm tracking-wide w-10 text-right">
                  {isPass ? 'PASS' : 'FAIL'}
                </span>
              );
            }

            const logForTs = group.endLog || group.startLog;
            const ts = logForTs?.timestamp ? formatDateYMD(parseServerTimestamp(logForTs.timestamp)) : '';
            return (
              <div key={`tab-${groupIndex}`} className="space-y-2">
                <IterationDetails
                  expandLevel={1}
                  title={
                    <div className="flex flex-col gap-0.5 min-w-0 w-full">
                      <div className="flex items-center justify-between min-w-0 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <Activity className="w-4 h-4 text-gray-900 dark:text-white shrink-0" />
                          <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                            Processing Tab: {tabName}{indexStr}
                            {durationStr && !isLive && <span className="text-gray-500 font-normal ml-1">{durationStr}</span>}
                            {isLive && (
                              <LiveDuration startTime={new Date(parseServerTimestamp(group.startLog.timestamp).getTime())} isActive={isBuildingForm} />
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {statusBadge || <div className="w-10"></div>}
                          {ts && <span className="hidden sm:flex text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-200 dark:bg-slate-800/50 px-2 py-0.5 rounded items-center gap-1 whitespace-nowrap shrink-0"><Clock className="w-3 h-3"/> {ts}</span>}
                        </div>
                      </div>
                    </div>
                  }
                  forceState={forceState}
                >
                  <div className="flex relative mt-1">
                    <div className="flex-1 space-y-2 min-w-0 pl-2">
                      {group.items.map((item: any, itemIndex: number) => {
                        if (item.type === 'ITERATION_GROUP') {
                          return renderIterationGroup(item, `${groupIndex}-${itemIndex}`);
                        }
                        return renderLog(item, item._originalIndex);
                      })}
                    </div>
                  </div>
                </IterationDetails>
              </div>
            );
          }
          if (group.type === 'ITERATION_GROUP') {
            return renderIterationGroup(group, groupIndex);
          }
          return renderLog(group, group._originalIndex);
        })}
        {isBuildingForm && (
          <div className="flex items-center gap-2 bg-transparent p-3 rounded-lg border border-gray-200 dark:border-[#27272A]/50">
            <RefreshCw className="w-4 h-4 animate-spin text-gray-900 dark:text-white" />
            <span className="font-medium text-sm text-gray-900 dark:text-white">Processing next step...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const FormBuilder: React.FC = () => {
  const { config, configVersion, publishNewConfigVersion, draftConfig, configHistory, migrationMaps, importSystemBackup, setHasUnsavedChanges, cases, importApplications } = useAppContext();
  const [localConfig, setLocalConfig] = useState(draftConfig || config);
  const [editingTab, setEditingTab] = useState<string | null>(() => {
    const initialConfig = draftConfig || config;
    return initialConfig?.tabs?.[0]?.id || null;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Track if we have unsaved changes locally relative to config/draft
  useEffect(() => {
    const cfg = draftConfig || config;
    setLocalConfig(cfg);
  }, [config, draftConfig]);
  
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [migrationDiffs, setMigrationDiffs] = useState<any[]>([]);

  useEffect(() => {
    if (JSON.stringify(localConfig) !== JSON.stringify(draftConfig || config)) {
      setHasUnsavedChanges(true);
    } else {
      setHasUnsavedChanges(false);
    }
    
    // Also warn if the user tries to reload the page
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(localConfig) !== JSON.stringify(draftConfig || config)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [localConfig, config, setHasUnsavedChanges]);

  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [isBuildingForm, setIsBuildingForm] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [swarmLogs, setSwarmLogs] = useState<any[]>([]);
  const [expandAllSwarmLogs, setExpandAllSwarmLogs] = useState<{level: number, timestamp: number}>({ level: 2, timestamp: 1 });
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [showSwarmModal, setShowSwarmModal] = useState(false);
  const [hitlData, setHitlData] = useState<any>(null);
  const [celexId, setCelexId] = useState('32024R1689');
  const [showCelexSheet, setShowCelexSheet] = useState(false);
  const celexCheatSheet = [
    { area: 'DORA / ICT risk', codes: ['32022R2554', '32024R2956', '32025R0302'] },
    { area: 'PSD2 / open banking', codes: ['32015L2366', '32018R0389'] },
    { area: 'Banking / prudential reporting', codes: ['32013R0575', '32013L0036', '32024R3117'] },
    { area: 'MiFID / MiFIR / capital markets', codes: ['32014L0065', '32014R0600'] },
    { area: 'EMIR / derivatives reporting', codes: ['32012R0648'] },
    { area: 'MiCA / crypto', codes: ['32023R1114'] },
    { area: 'AML', codes: ['32015L0849', '32024R1624', '32024L1640'] },
    { area: 'NIS2 / cyber', codes: ['32022L2555'] },
    { area: 'GDPR', codes: ['32016R0679'] },
    { area: 'AI Act', codes: ['32024R1689'] },
    { area: 'DSA / DMA', codes: ['32022R2065', '32022R1925'] },
    { area: 'CSRD / ESRS / Taxonomy', codes: ['32022L2464', '32023R2772', '32020R0852', '32021R2178'] },
    { area: 'MDR / IVDR / products', codes: ['32017R0745', '32017R0746', '32023R0988', '32023R1230'] },
    { area: 'Cyber Resilience Act', codes: ['32024R2847'] },
  ];
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [isImprovingMeta, setIsImprovingMeta] = useState(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);

  const triggerMetaImprovement = async () => {
    const activeJobId = lastJobId || sessionStorage.getItem('activeSwarmJobId');
    if (!activeJobId) {
      alert("No active session ID found.");
      return;
    }
    setIsImprovingMeta(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL;
      const response = await fetch(`${API_BASE_URL}/api/meta-improve/${activeJobId}`, { method: 'POST' });
      if (!response.ok) {
        let errMessage = "Unknown error";
        try {
          const errData = await response.json();
          errMessage = errData.error || errMessage;
        } catch(e) {}
        throw new Error(errMessage);
      }
      const result = await response.json();
      if (result.status === 'success') {
        const text = result.conclusion || "";
        // Split ONLY on file headers or known opening code blocks to prevent splitting on closing backticks
        const rawParts = text.split(/(?=^(?:#|\*|-|\s)*(?:File\s*\d+|mutated_agent\.py|mutation_diff\.patch|mutation_conclusions\.md)[\s:*]*|^```(?:python|diff|json|md|markdown|javascript|typescript|bash|sh|text)\b)/im);
        const validParts: string[] = [];
        
        for (let i = 0; i < rawParts.length; i++) {
          // Remove completely empty code blocks that LLMs sometimes generate (e.g. ```python\n```)
          let p = rawParts[i].replace(/```[a-zA-Z0-9_]*\s*```/g, '').trim();
          if (p.length === 0) continue;
          
          const codeBlockCount = (p.match(/```/g) || []).length;
          
          // If this part has an unclosed code block (odd number of ```), OR 
          // it's a short header without any code blocks, merge it with the next part.
          if ((codeBlockCount % 2 !== 0 || (p.length < 150 && codeBlockCount === 0)) && i + 1 < rawParts.length) {
            rawParts[i+1] = p + '\n\n' + rawParts[i+1];
          } else {
            validParts.push(p);
          }
        }
        
        if (validParts.length === 0) validParts.push(text);

        setSwarmLogs(prev => [...prev, {
          type: 'META_CONCLUSION_GROUP',
          payload: { agent: 'Meta Improvement Agent', parts: [], fullText: text },
          timestamp: new Date().toISOString()
        }]);

        for (let i = 0; i < validParts.length; i++) {
          const p = validParts[i];
          let title = "Self Improvement Insights";
          
          if (p.match(/```diff/i) || p.match(/mutation_diff\.patch/i)) {
            title = "Self Improvement Mutation Patch (Diff)";
          } else if (p.match(/mutation_conclusions\.md/i) || p.match(/```(?:md|markdown)/i)) {
            title = "Self Improvement Conclusions";
          } else if (p.match(/```python/i) || p.match(/mutated_agent\.py/i)) {
            title = "Self Improvement Mutated Agent Code";
          } else {
            // Match the first non-empty line that isn't just backticks
            const headingMatch = p.match(/^(?:#|\*|-|\s)*([^`\n][^\n]*)/m);
            if (headingMatch) {
                const potentialTitle = headingMatch[1].replace(/[*#_:-]/g, '').trim();
                if (potentialTitle.length > 3 && potentialTitle.length < 50) {
                    title = "Self Improvement " + potentialTitle;
                }
            }
          }

          setSwarmLogs(prev => {
            const newLogs = [...prev];
            const groupLogIdx = newLogs.findLastIndex(l => l.type === 'META_CONCLUSION_GROUP');
            if (groupLogIdx !== -1) {
              const groupLog = newLogs[groupLogIdx];
              newLogs[groupLogIdx] = {
                ...groupLog,
                payload: {
                  ...groupLog.payload,
                  parts: [...(groupLog.payload.parts || []), { conclusion: p, title }]
                }
              };
            }
            return newLogs;
          });
          
          if (i < validParts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 18000));
          }
        }
      }
    } catch (error: any) {
      console.error(error);
      alert(`Error triggering meta improvement: ${error.message || error}`);
    } finally {
      setIsImprovingMeta(false);
    }
  };

  const handleCopyLogs = () => {
    const header = `=== Session Logs (CELEX: ${celexId}) ===\n`;
    let isInsideTab = false;
    let isInsideIteration = false;

    const text = header + swarmLogs.map((log, _index, logs) => {
      if (log.type === 'TAB_START') {
        isInsideTab = true;
        isInsideIteration = false;
        return `\n## TAB_START: ${log.payload?.tab_id || 'Unknown'}`;
      }
      if (log.type === 'TAB_END') {
        isInsideTab = false;
        isInsideIteration = false;
        return `\n## TAB_END: ${log.payload?.tab_id || 'Unknown'}\n`;
      }
      if (log.type === 'ITERATION_START') {
        isInsideIteration = true;
        return `\n${isInsideTab ? '  ' : ''}### --- Iteration ${log.payload?.iteration} ---`;
      }
      if (log.type === 'ITERATION_END') {
        isInsideIteration = false;
        return null;
      }

      const ts = log.timestamp ? formatDateYMD(parseServerTimestamp(log.timestamp)) : '';
      const agent = log.payload?.agent || log.agent || '';

      let prefix = '';
      if (isInsideIteration) prefix = '    ';
      else if (isInsideTab) prefix = '  ';

      let logText = '';
      if (log.type === 'START') logText = `[${ts}] [SYSTEM]: ${log.payload}`;
      else if (log.type === 'AGENT_START') logText = `[${ts}] [AGENT_START]: ${agent}`;
      else if (log.type === 'AGENT_END') {
        const startLog = logs.slice(0, _index).reverse().find((l: any) => l.type === 'AGENT_START' && (l.payload?.agent || l.agent) === agent);
        let durationStr = '';
        if (startLog && startLog.timestamp && log.timestamp) {
          const diffMs = parseServerTimestamp(log.timestamp).getTime() - parseServerTimestamp(startLog.timestamp).getTime();
          const diffSec = (diffMs / 1000).toFixed(1);
          durationStr = ` (${diffSec}s)`;
        }
        logText = `[${ts}] [AGENT_END] [${agent}]:${durationStr}`;
      }
      else if (log.type === 'AGENT_CHUNK') {
        const chunkContent = log.chunk ?? log.payload?.chunk;
        if (chunkContent === undefined) return null;
        
        // Properly indent multi-line chunk content
        const indentedChunk = String(chunkContent).split('\n').map(line => `${prefix}      ${line}`).join('\n');
        return `${prefix}  [${ts}] [${agent}]:\n${indentedChunk}`;
      }
      else if (log.type === 'AGENT_CONCLUSION') logText = `[${ts}] [${agent} Conclusion]: ${log.payload?.conclusion}`;
      else if (log.type === 'META_CONCLUSION') logText = `\n${prefix}[${ts}] [META CONCLUSION]:\n${prefix}${log.payload?.conclusion}\n`;
      else if (log.type === 'SUCCESS') logText = `[${ts}] [SUCCESS]: ${log.payload?.message}`;
      else if (log.type === 'ERROR') logText = `[${ts}] [ERROR]: ${log.payload?.message || JSON.stringify(log.payload)}`;
      else if (log.type === 'SYNTAX_FAIL') logText = `[${ts}] [SYNTAX_FAIL]: \n${prefix}${log.payload?.errors}`;
      else if (log.type === 'SYNTAX_PASS') logText = `[${ts}] [SYNTAX_PASS]`;
      else if (log.type === 'CONSENSUS_FAILED') logText = `[${ts}] [CONSENSUS_FAILED]: Iteration ${log.payload?.iteration}`;
      else if (log.type === 'CONSENSUS_REACHED') logText = `[${ts}] [CONSENSUS_REACHED]`;
      else if (log.type === 'HITL_REQUIRED') logText = `[${ts}] [HITL_REQUIRED]: ${log.payload?.message}`;
      else logText = `[${ts}] [${log.type}]: ${JSON.stringify(log.payload)}`;

      return `${prefix}${logText}`;
    }).filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const pollJob = async (job_id: string, initialStartIndex: number = 0) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const currentAbortController = new AbortController();
    abortControllerRef.current = currentAbortController;
    
    // Set active job ID in session storage
    sessionStorage.setItem('activeSwarmJobId', job_id);
    setLastJobId(job_id);
    
    setSwarmLogs([]);
    setHitlData(null);
    setIsBuildingForm(false);
    setShowSwarmModal(true);
    
    let startIndex = initialStartIndex;
    let jobComplete = false;
    let wakeLock: any = null;
    
    try {
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.warn(`Wake Lock error: ${err}`);
        }
      }

      while (!jobComplete) {
        if (currentAbortController.signal.aborted) break;

        let statusRes;
        try {
          const API_BASE_URL = import.meta.env.VITE_API_URL;
          statusRes = await fetch(`${API_BASE_URL}/api/job-status/${job_id}?start_index=${startIndex}`, {
            signal: currentAbortController.signal
          });
        } catch (err: any) {
          if (err.name === 'AbortError') throw err;
          // Network error, maybe screen is off. Wait and retry.
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        if (!statusRes.ok) {
          await new Promise(r => setTimeout(r, 2000));
          continue; // Keep trying if server temporarily errors
        }

        const data = await statusRes.json();
        if (currentAbortController.signal.aborted) break;
        
        if (["RUNNING", "QUEUED"].includes(data.status)) {
            setIsBuildingForm(true);
        } else {
            setIsBuildingForm(false);
        }

        if (data.server_time) {
          const serverT = parseServerTimestamp(data.server_time).getTime();
          setServerTimeOffset(Date.now() - serverT);
        }

        if (data.status === "NOT_FOUND") {
          throw new Error("Job not found on server.");
        }

        if (data.celex_id) {
          setCelexId(data.celex_id.replace(/^CELEX:/i, ''));
        }

        for (const event of data.logs) {
          startIndex++;
          if (event.type === "COMPLETE" || event.type === "COMPLETED") {
            try {
              let finalConfig = event.payload.form_schema;
              if (!finalConfig && event.payload.last_json) {
                finalConfig = JSON.parse(event.payload.last_json);
              }
              if (finalConfig) {
                setLocalConfig({ ...finalConfig, celex_id: `CELEX:${celexId}` });
                setEditingTab(finalConfig?.tabs?.[0]?.id || null);
                setSwarmLogs((prev: any[]) => [...prev, { type: 'SUCCESS', payload: { message: 'Form built successfully!', schema: finalConfig } }]);
              }
            } catch (e) {
              console.error("Failed to parse form schema on complete", e);
            }
          } else if (event.type === "HITL_REQUIRED") {
            try {
              const parsed = JSON.parse(event.payload.last_json);
              if (parsed) {
                const tabs = Array.isArray(parsed) ? parsed : (parsed.tabs || []);
                setLocalConfig((prev: any) => ({ ...prev, version: "HITL-Draft", tabs, celex_id: `CELEX:${celexId}` }));
                setEditingTab(tabs[0]?.id || null);
                setHitlData({ message: event.payload.message });
              }
            } catch (e) {}
            setSwarmLogs((prev: any[]) => [...prev, { type: 'HITL_REQUIRED', payload: event.payload }]);
          } else if (event.type === "AGENT_CHUNK") {
            setSwarmLogs((prev: any[]) => {
              const last = prev[prev.length - 1];
              if (last && last.type === 'AGENT_CHUNK' && last.agent === event.payload.agent) {
                const newLogs = [...prev];
                newLogs[newLogs.length - 1].chunk += event.payload.chunk;
                return newLogs;
              }
              return [...prev, { type: 'AGENT_CHUNK', agent: event.payload.agent, chunk: event.payload.chunk, timestamp: event.timestamp }];
            });
          } else {
            setSwarmLogs((prev: any[]) => [...prev, { type: event.type, payload: event.payload, timestamp: event.timestamp }]);
          }
        }

        if (["ERROR", "FAILED", "COMPLETE", "COMPLETED", "HITL_REQUIRED", "CANCELLED", "ORPHANED"].includes(data.status) && data.logs.length === 0) {
          jobComplete = true;
        }

        if (!jobComplete && data.logs.length === 0) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    } catch (e: any) {
      if (!currentAbortController.signal.aborted) {
        if (e.name === 'AbortError') {
          setSwarmLogs((prev: any[]) => [...prev, { type: 'ERROR', payload: { message: 'Build aborted by user.' } }]);
        } else {
          console.error(e);
          setSwarmLogs((prev: any[]) => [...prev, { type: 'ERROR', payload: { message: e.message } }]);
        }
      }
    } finally {
      if (!currentAbortController.signal.aborted) {
        setShowSwarmModal(true);
        setIsBuildingForm(false);
        sessionStorage.removeItem('activeSwarmJobId');
      }
      if (wakeLock !== null) {
        try {
          await wakeLock.release();
        } catch (err) {}
      }
    }
  };

  // Auto-resume removed per user request

  useScrollLock(showSwarmModal);

  const handleStartSwarm = async () => {
    if (isBuildingForm) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsBuildingForm(false);
      const currentJobId = sessionStorage.getItem('activeSwarmJobId');
      if (currentJobId) {
        const API_BASE_URL = import.meta.env.VITE_API_URL;
        fetch(`${API_BASE_URL}/api/queue/${currentJobId}`, {
          method: 'DELETE',
          headers: { 'X-Instance-Id': getInstanceId() }
        }).catch(console.error);
      }
      return;
    }

    if (!window.confirm("Warning: The AI form building process is time-consuming as it takes into account real EU regulation documents. As a result, it might generate costs and in some cases might not be successful. Do you want to proceed?")) {
      return;
    }

    try {
      setIsBuildingForm(true);
      setSwarmLogs([]);
      setShowSwarmModal(true);
      setHitlData(null);

      const API_BASE_URL = import.meta.env.VITE_API_URL;
      const res = await fetch(`${API_BASE_URL}/api/build-form-swarm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Instance-Id': getInstanceId() },
        body: JSON.stringify({
          regulatory_text: "EU AI Act",
          celex_id: `CELEX:${celexId}`,
          legacy_schema: localConfig
        })
      });
      
      if (!res.ok) {
        let errMessage = "Failed to start job";
        try {
          const errData = await res.json();
          if (errData.error) errMessage = errData.error;
        } catch (e) {}
        throw new Error(errMessage);
      }
      const resData = await res.json();
      const job_id = resData.job_id || resData.session_id;
      sessionStorage.setItem('activeSwarmJobId', job_id);
      const myJobs = JSON.parse(localStorage.getItem('mySwarmJobs') || '[]');
      if (!myJobs.includes(job_id)) {
        myJobs.push(job_id);
        localStorage.setItem('mySwarmJobs', JSON.stringify(myJobs));
      }
      pollJob(job_id);
    } catch (e: any) {
      console.error(e);
      setSwarmLogs([{ type: 'ERROR', payload: { message: e.message } }]);
      setIsBuildingForm(false);
    }
  };

  const saveConfig = () => {
    try {
      validateFormConfig(localConfig);
    } catch (e: any) {
      alert(`Validation Error: ${e.message}`);
      return;
    }
    
    // Build diffs for migration map
    const extractAllQuestions = (tabs: any[]) => {
      const qs: any[] = [];
      tabs.forEach(t => {
        getQuestions(t).forEach((q: any) => {
          qs.push(q);
          if (q.type === 'dynamic-list' && Array.isArray(q.subFields)) {
            q.subFields.forEach((sf: any) => {
              qs.push({ ...sf, id: `${q.id} -> ${sf.id}`, type: sf.type || 'text', isSubField: true, parentId: q.id });
            });
          }
        });
      });
      return qs;
    };
    
    const oldQuestions = extractAllQuestions(getTabs(config) || []);
    const newQuestions = extractAllQuestions(getTabs(localConfig) || []);
    
    const diffs: any[] = [];
    const newMap: any = {};
    
    oldQuestions.forEach((oq: any) => {
      const nq = newQuestions.find((q: any) => q.id === oq.id);
      if (!nq) {
        diffs.push({ qId: oq.id, oldText: oq.text, type: 'deleted' });
      } else {
        const oOptionsStr = JSON.stringify(oq.options || []);
        const nOptionsStr = JSON.stringify(nq.options || []);
        const optionsChanged = (oq.options || nq.options) && oOptionsStr !== nOptionsStr;

        const typeChanged = oq.type !== nq.type;
        const textChanged = oq.text !== nq.text;
        const placeholderChanged = oq.placeholder !== nq.placeholder;
        const tooltipChanged = oq.tooltip !== nq.tooltip;

        if (typeChanged || textChanged || optionsChanged || placeholderChanged || tooltipChanged) {
           let diffType = 'changed';
           if (!typeChanged && !textChanged && !optionsChanged) diffType = 'metadata_changed';
           else if (!typeChanged && !optionsChanged) diffType = 'text_changed';
           else if (!typeChanged && !textChanged) diffType = 'options_changed';
           
           diffs.push({ 
             qId: oq.id, oldText: oq.text, newText: nq.text, 
             oldType: oq.type, newType: nq.type, 
             oldOptions: oq.options, newOptions: nq.options,
             oldPlaceholder: oq.placeholder, newPlaceholder: nq.placeholder,
             oldTooltip: oq.tooltip, newTooltip: nq.tooltip,
             type: diffType 
           });
           newMap[oq.id] = { action: 'copy' };
        } else {
           newMap[oq.id] = { action: 'copy' };
        }
      }
    });
    
    newQuestions.forEach((nq: any) => {
      const oq = oldQuestions.find((q: any) => q.id === nq.id);
      if (!oq) {
        diffs.push({ qId: nq.id, newText: nq.text, type: 'added' });
      }
    });

    if (diffs.length > 0) {
      setMigrationDiffs(diffs);
      setShowMigrationModal(true);
    } else {
       const map: any = {};
       oldQuestions.forEach((oq: any) => { map[oq.id] = { action: 'copy' }; });
       publishNewConfigVersion(localConfig);
       setHasUnsavedChanges(false);
       alert(`Configuration Version ${configVersion + 1} published directly!`);
    }
  };

  const confirmPublish = () => {
    const configToPublish = { ...localConfig };
    if (!configToPublish.celex_id && celexId) {
        configToPublish.celex_id = `CELEX:${celexId}`;
    }
    publishNewConfigVersion(configToPublish);
    setHasUnsavedChanges(false);
    setShowMigrationModal(false);
    alert(`Configuration Version ${configVersion + 1} Published!`);
  };

  const exportApplications = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cases, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "compliance-cases.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportApplications = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed && typeof parsed === 'object') {
          importApplications(parsed);
          alert('Applications imported successfully!');
        } else {
          alert('Invalid applications format.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const exportConfig = () => {
    const configToExport = { ...localConfig };
    if (!configToExport.celex_id && celexId) {
        configToExport.celex_id = `CELEX:${celexId}`;
    }
    const backup = {
      config: configToExport,
      configVersion,
      configHistory,
      migrationMaps
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "forms.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed && (parsed.tabs || parsed.config)) {
          if (parsed.config) {
            importSystemBackup(parsed);
            setLocalConfig(parsed.config);
            alert('System Backup imported successfully! All historical versions and maps restored.');
          } else {
            setLocalConfig(parsed);
            alert('Configuration imported successfully! Remember to Publish Changes.');
          }
        } else {
          alert('Invalid configuration format.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const addTab = () => {
    const newTabId = `tab_${Date.now()}`;
    setLocalConfig({
      ...localConfig,
      tabs: [
        ...getTabs(localConfig),
        { id: newTabId, title: 'New Tab', questions: [] }
      ]
    });
    setEditingTab(newTabId);
  };

  const removeTab = (tabId: string) => {
    if (!window.confirm("Are you sure you want to delete this tab? This will remove all questions inside it.")) return;
    setLocalConfig({
      ...localConfig,
      tabs: getTabs(localConfig).filter((t: any) => t.id !== tabId)
    });
    if (editingTab === tabId) setEditingTab(null);
  };

  const moveTabUp = (index: number) => {
    if (index === 0) return;
    const newTabs = [...getTabs(localConfig)];
    [newTabs[index - 1], newTabs[index]] = [newTabs[index], newTabs[index - 1]];
    setLocalConfig({ ...localConfig, tabs: newTabs });
  };

  const moveTabDown = (index: number) => {
    if (index === getTabs(localConfig).length - 1) return;
    const newTabs = [...getTabs(localConfig)];
    [newTabs[index], newTabs[index + 1]] = [newTabs[index + 1], newTabs[index]];
    setLocalConfig({ ...localConfig, tabs: newTabs });
  };

  const updateTabTitle = (tabId: string, title: string) => {
    setLocalConfig({
      ...localConfig,
      tabs: (getTabs(localConfig) || []).map((t: any) => t.id === tabId ? { ...t, title } : t)
    });
  };

  const addQuestion = (tabId: string) => {
    setLocalConfig({
      ...localConfig,
      tabs: (getTabs(localConfig) || []).map((t: any) => {
        if (t.id === tabId) {
          return {
            ...t,
            questions: [
              ...getQuestions(t),
              { id: `q_${generateShortId()}`, text: 'New Question', type: 'text', required: false, dependsOnExpression: '' }
            ]
          };
        }
        return t;
      })
    });
  };

  const removeQuestion = (tabId: string, qId: string) => {
    if (!window.confirm("Are you sure you want to delete this question? This may break logic that depends on it.")) return;
    setLocalConfig({
      ...localConfig,
      tabs: (getTabs(localConfig) || []).map((t: any) => {
        if (t.id === tabId) {
          return {
            ...t,
            questions: getQuestions(t).filter((q: any) => q.id !== qId)
          };
        }
        return t;
      })
    });
  };

  const updateQuestionId = (tabId: string, oldId: string, newId: string) => {
    if (!newId || newId === oldId) return;
    
    // Check if newId already exists across all tabs
    const exists = getTabs(localConfig).some((t: any) => getQuestions(t).some((q: any) => q.id === newId));
    if (exists) {
      alert(`Question ID "${newId}" already exists.`);
      return;
    }

    setLocalConfig((prev: any) => {
      const nextConfig = JSON.parse(JSON.stringify(prev));
      // Update ID
      const tab = getTabs(nextConfig).find((t: any) => t.id === tabId);
      if (tab) {
        const q = getQuestions(tab).find((q: any) => q.id === oldId);
        if (q) q.id = newId;
      }
      
      // Update dependencies everywhere
      getTabs(nextConfig).forEach((t: any) => {
        getQuestions(t).forEach((q: any) => {
          if (q.dependsOnExpression) {
            // naive replace with word boundaries
            const regex = new RegExp(`\\b${oldId}\\b`, 'g');
            q.dependsOnExpression = q.dependsOnExpression.replace(regex, newId);
          }
        });
      });
      return nextConfig;
    });
  };

  const moveQuestionUp = (tabId: string, qIndex: number) => {
    if (qIndex === 0) return;
    setLocalConfig({
      ...localConfig,
      tabs: (getTabs(localConfig) || []).map((t: any) => {
        if (t.id === tabId) {
          const newQs = [...getQuestions(t)];
          [newQs[qIndex - 1], newQs[qIndex]] = [newQs[qIndex], newQs[qIndex - 1]];
          return { ...t, questions: newQs };
        }
        return t;
      })
    });
  };

  const moveQuestionDown = (tabId: string, qIndex: number) => {
    setLocalConfig({
      ...localConfig,
      tabs: (getTabs(localConfig) || []).map((t: any) => {
        if (t.id === tabId) {
          if (qIndex === getQuestions(t).length - 1) return t;
          const newQs = [...getQuestions(t)];
          [newQs[qIndex], newQs[qIndex + 1]] = [newQs[qIndex + 1], newQs[qIndex]];
          return { ...t, questions: newQs };
        }
        return t;
      })
    });
  };

  const updateQuestion = (tabId: string, qId: string, field: string, value: any) => {
    setLocalConfig({
      ...localConfig,
      tabs: (getTabs(localConfig) || []).map((t: any) => {
        if (t.id === tabId) {
          return {
            ...t,
            questions: getQuestions(t).map((q: any) => q.id === qId ? { ...q, [field]: value } : q)
          };
        }
        return t;
      })
    });
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="saas-card rounded-2xl p-6 md:p-8 mb-8 border-l-4 border-l-primary-500 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Form Builder</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Configure the compliance form structure, tabs, questions, and dependencies.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 w-full shrink-0 xl:w-auto">
          
          {/* Data Management Group */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-start xl:justify-end gap-2 w-full">
            <label className="flex w-full sm:w-auto items-center justify-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white shadow-md shadow-primary-500/20 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0">
              <Download className="w-4 h-4" />
              <span>Import Schema</span>
              <input type="file" accept=".json" className="hidden" onChange={handleImportConfig} />
            </label>
            <button 
              onClick={exportConfig}
              className="flex w-full sm:w-auto items-center justify-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white shadow-md shadow-primary-500/20 rounded-xl text-sm font-semibold transition-all whitespace-nowrap shrink-0"
            >
              <Upload className="w-4 h-4" />
              <span>Export Schema</span>
            </button>
            
            <div className="w-px h-6 bg-gray-200 dark:bg-[#27272A] hidden sm:block mx-1"></div>
            
            <label className="flex w-full sm:w-auto items-center justify-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white shadow-md shadow-primary-500/20 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0">
              <Download className="w-4 h-4" />
              <span>Import Apps</span>
              <input type="file" accept=".json" className="hidden" onChange={handleImportApplications} />
            </label>
            <button 
              onClick={exportApplications}
              className="flex w-full sm:w-auto items-center justify-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white shadow-md shadow-primary-500/20 rounded-xl text-sm font-semibold transition-all whitespace-nowrap shrink-0"
            >
              <Upload className="w-4 h-4" />
              <span>Export Apps</span>
            </button>
          </div>
          
          {/* AI Builder Group & Publishing */}
          <div className="flex flex-wrap items-center justify-between gap-2 w-full shrink-0">
            <div className="flex items-center gap-2 relative z-[100]">
              <div className="flex items-center w-full sm:w-[220px] px-3 py-2 bg-white dark:bg-[#0A0A0B] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-[#27272A] rounded-xl text-sm focus-within:ring-2 focus-within:ring-violet-500 shadow-inner shrink-0 transition-shadow">
                <span className="text-gray-500 dark:text-gray-400 select-none pr-1">CELEX:</span>
                <input 
                  type="text" 
                  value={celexId}
                  onChange={(e) => {
                    let val = e.target.value.toUpperCase();
                    if (val.startsWith('CELEX:')) val = val.substring(6);
                    const cleanVal = val.replace(/[^A-Z0-9]/g, '').substring(0, 20);
                    setCelexId(cleanVal);
                    if (cleanVal) {
                      setLocalConfig((prev: any) => ({...prev, celex_id: `CELEX:${cleanVal}`}));
                    } else {
                      setLocalConfig((prev: any) => { const next = {...prev}; delete next.celex_id; return next; });
                    }
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="32024R1689"
                  className="w-full bg-transparent focus:outline-none placeholder-gray-400 dark:placeholder-gray-600"
                />
              </div>
              <button 
                onClick={() => setShowCelexSheet(!showCelexSheet)}
                className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-[#1C1C1E] dark:hover:bg-[#2C2C2E] rounded-xl transition-colors shrink-0"
                title="CELEX Cheat Sheet"
              >
                <BookOpen className="w-4 h-4" />
              </button>

              {showCelexSheet && (
                <div className="absolute top-full mt-2 left-0 w-[350px] sm:w-[450px] max-h-[400px] overflow-y-auto bg-white dark:bg-[#18181B] border border-gray-200 dark:border-[#27272A] rounded-xl shadow-2xl p-4">
                  <div className="flex justify-between items-center mb-4 sticky top-0 bg-white dark:bg-[#18181B] pb-2 border-b border-gray-100 dark:border-gray-800">
                    <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-violet-500" /> CELEX Cheat Sheet
                    </h4>
                    <button onClick={() => setShowCelexSheet(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"><X className="w-4 h-4"/></button>
                  </div>
                  <div className="space-y-3">
                    {celexCheatSheet.map((item, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-50 dark:border-gray-800/50 pb-2 last:border-0 last:pb-0 hover:bg-gray-50 dark:hover:bg-white/[0.02] p-1 -mx-1 rounded transition-colors">
                        <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 leading-tight">{item.area}</span>
                        <div className="flex flex-wrap gap-1 justify-start sm:justify-end">
                          {item.codes.map(code => (
                            <button
                              key={code}
                              onClick={() => { 
                                setCelexId(code); 
                                setLocalConfig((prev: any) => ({...prev, celex_id: `CELEX:${code}`}));
                                setHasUnsavedChanges(true);
                                setShowCelexSheet(false); 
                              }}
                              className="px-2 py-1 text-[11px] font-mono font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors border border-violet-200/50 dark:border-violet-800/30 shadow-sm"
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button 
              onClick={handleStartSwarm}
            className={`flex w-full sm:w-auto items-center justify-center space-x-2 px-4 py-2 text-white rounded-xl text-sm font-semibold shadow-lg transition-all whitespace-nowrap shrink-0 ${
              isBuildingForm ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-md shadow-violet-500/20'
            }`}
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${isBuildingForm ? 'animate-spin' : ''}`} />
            <span>{isBuildingForm ? 'Cancel AI Build' : 'Build Form (AI)'}</span>
          </button>
          
          {/* Primary Action */}
          <button 
            onClick={saveConfig}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-primary-500/30 transition-all whitespace-nowrap shrink-0 w-full sm:w-auto"
          >
            <Save className="w-4 h-4 shrink-0" />
            <span>Publish New Version</span>
          </button>
          </div>
        </div>
      </div>
      
      {showMigrationModal && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-[#0A0A0B]/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#0A0A0B] rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-[#27272A]">
            <div className="sticky top-0 bg-white dark:bg-[#0A0A0B] border-b border-gray-200 dark:border-slate-800 p-6 flex justify-between items-center z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Introduced changes (v{configVersion} &rarr; v{configVersion + 1})</h2>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {migrationDiffs.map((diff, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-gray-200 dark:border-[#27272A] bg-[#F3F4F6] dark:bg-[#1C1C1E]/50">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-400 break-all mr-2">{diff.qId}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wider shrink-0 ${
                      diff.type === 'added' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      diff.type === 'deleted' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {diff.type.replace('_', ' ')}
                    </span>
                  </div>
                  
                  {diff.type === 'added' && <p className="text-gray-700 dark:text-gray-300">"{diff.newText}"</p>}
                  {diff.type === 'deleted' && <p className="text-gray-700 dark:text-gray-300 line-through opacity-70">"{diff.oldText}"</p>}
                  {(diff.type === 'changed' || diff.type === 'text_changed' || diff.type === 'options_changed' || diff.type === 'metadata_changed') && (
                    <div className="space-y-2">
                      {diff.oldText !== diff.newText && (
                        <>
                          <p className="text-gray-700 dark:text-gray-400 line-through text-sm">"{diff.oldText}" {diff.oldType && `(${diff.oldType})`}</p>
                          <p className="text-gray-800 dark:text-gray-200">"{diff.newText}" {diff.newType && `(${diff.newType})`}</p>
                        </>
                      )}
                      
                      {diff.oldPlaceholder !== diff.newPlaceholder && (
                        <div className="mt-2 text-sm">
                          <p className="font-semibold text-gray-600 dark:text-gray-400 mb-1 text-xs uppercase tracking-wider">Placeholder Changed:</p>
                          <p className="text-gray-700 dark:text-gray-400 line-through text-xs">"{diff.oldPlaceholder || ''}"</p>
                          <p className="text-gray-800 dark:text-gray-200 text-xs">"{diff.newPlaceholder || ''}"</p>
                        </div>
                      )}

                      {diff.oldTooltip !== diff.newTooltip && (
                        <div className="mt-2 text-sm">
                          <p className="font-semibold text-gray-600 dark:text-gray-400 mb-1 text-xs uppercase tracking-wider">Tooltip Changed:</p>
                          <p className="text-gray-700 dark:text-gray-400 line-through text-xs">"{diff.oldTooltip || ''}"</p>
                          <p className="text-gray-800 dark:text-gray-200 text-xs">"{diff.newTooltip || ''}"</p>
                        </div>
                      )}
                      
                      {((diff.oldOptions && diff.oldOptions.length > 0) || (diff.newOptions && diff.newOptions.length > 0)) && diff.oldOptions !== diff.newOptions && (
                        <div className="mt-2 text-sm bg-slate-100 dark:bg-[#1C1C1E] rounded p-3 border border-gray-200 dark:border-[#27272A]">
                          <p className="font-semibold text-gray-600 dark:text-gray-400 mb-2 text-xs uppercase tracking-wider">Answers (Options) Changed:</p>
                          <div className="flex gap-4">
                            <div className="flex-1">
                              <span className="text-xs font-bold text-red-500 uppercase">Old Options</span>
                              <ul className="list-disc list-inside text-gray-700 dark:text-gray-400 line-through text-xs mt-1">
                                {(diff.oldOptions || []).map((o: string, i: number) => <li key={i}>{o}</li>)}
                                {(!diff.oldOptions || diff.oldOptions.length === 0) && <li>None</li>}
                              </ul>
                            </div>
                            <div className="flex-1">
                              <span className="text-xs font-bold text-green-600 dark:text-green-500 uppercase">New Options</span>
                              <ul className="list-disc list-inside text-gray-800 dark:text-gray-200 text-xs mt-1">
                                {(diff.newOptions || []).map((o: string, i: number) => <li key={i}>{o}</li>)}
                                {(!diff.newOptions || diff.newOptions.length === 0) && <li>None</li>}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="sticky bottom-0 bg-[#F3F4F6] dark:bg-[#0A0A0B] border-t border-gray-200 dark:border-slate-800 p-6 flex justify-end gap-4 z-10">
              <button 
                onClick={() => setShowMigrationModal(false)}
                className="px-6 py-2.5 rounded-xl font-semibold text-gray-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-[#1C1C1E] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmPublish}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-all shadow-md shadow-primary-500/20"
              >
                Confirm & Publish
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full">
        {/* Tab Editor */}
        <div className="w-full">
          {editingTab ? (
            <div className="saas-card rounded-2xl p-6">
              {(getTabs(localConfig) || []).map((tab: any) => tab.id === editingTab && (
                <div key={tab.id} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tab Title</label>
                    <input 
                      type="text" 
                      value={tab.title}
                      onChange={(e) => updateTabTitle(tab.id, e.target.value)}
                      className="w-full bg-[#F3F4F6] dark:bg-[#0A0A0B] text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-[#27272A] rounded-lg px-4 py-2"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-800 dark:text-gray-200">Questions in this Tab</h3>
                    </div>

                    <div className="space-y-4">
                      {(getQuestions(tab) || []).map((q: any, qIndex: number) => (
                        <QuestionEditor 
                          key={q.id}
                          tab={tab}
                          q={q}
                          qIndex={qIndex}
                          localConfig={localConfig}
                          updateQuestion={updateQuestion}
                          removeQuestion={removeQuestion}
                          moveQuestionUp={moveQuestionUp}
                          moveQuestionDown={moveQuestionDown}
                          updateQuestionId={updateQuestionId}
                        />
                      ))}
                      
                      {getQuestions(tab).length === 0 && (
                        <div className="text-center p-8 border-2 border-dashed border-gray-200 dark:border-[#27272A] rounded-xl text-gray-700 dark:text-gray-400">
                          No questions in this tab yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="saas-card rounded-2xl p-12 text-center text-gray-700 dark:text-gray-400 flex flex-col items-center">
              <Edit2 className="w-12 h-12 mb-4 text-gray-300 dark:text-gray-600" />
              <p>Open Form Tabs on the right to select a tab to edit.</p>
            </div>
          )}
        </div>
      </div>

      {/* Forms Tab Backdrop */}
      {createPortal(
        <>
          <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-[#0A0A0B]/60 backdrop-blur-sm z-[9998]"
          />
        )}
      </AnimatePresence>

      {/* Forms Tab Slide-out Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-[350px] bg-white dark:bg-[#1C1C1E] border-l border-gray-200 dark:border-[#27272A] shadow-2xl z-[9999] flex flex-col p-5"
          >
            <div className="flex items-center justify-between mb-4 shrink-0 border-b border-gray-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-gray-800 dark:text-gray-200">Form Tabs</h3>
            </div>
            
            {/* Tab List - Scrollable */}
            <div 
              className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2.5 pr-1 -mr-1 mb-4"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {(getTabs(localConfig) || []).map((tab: any, tIndex: number) => (
                <div 
                  key={tab.id}
                  className={`flex items-start justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    editingTab === tab.id
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30'
                      : 'bg-gray-50 dark:bg-[#0A0A0B] border border-gray-250/50 dark:border-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-855'
                  }`}
                  onClick={() => setEditingTab(editingTab === tab.id ? null : tab.id)}
                >
                  <span className="font-semibold break-words flex-1 mr-2 text-sm text-left">{tab.title}</span>
                  <div className="flex items-center space-x-0.5 shrink-0 ml-1 mt-[-2px]">
                    <button 
                      onClick={(e) => { e.stopPropagation(); moveTabUp(tIndex); }} 
                      className={`p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors ${editingTab === tab.id ? 'text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`} 
                      disabled={tIndex === 0}
                    >
                      <ChevronUp className={`w-3.5 h-3.5 ${tIndex === 0 ? 'opacity-30' : ''}`} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); moveTabDown(tIndex); }} 
                      className={`p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors ${editingTab === tab.id ? 'text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`} 
                      disabled={tIndex === getTabs(localConfig).length - 1}
                    >
                      <ChevronDown className={`w-3.5 h-3.5 ${tIndex === getTabs(localConfig).length - 1 ? 'opacity-30' : ''}`} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                      className={`p-1 hover:bg-red-500/20 rounded transition-colors ${editingTab === tab.id ? 'text-red-200 hover:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-red-500'}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Bottom buttons - Pinned at the bottom of the drawer */}
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-100 dark:border-slate-800 shrink-0">
              <button 
                onClick={addTab} 
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold shadow-md transition-colors text-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Tab</span>
              </button>
              <button 
                onClick={() => setIsSidebarOpen(false)} 
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold shadow-md transition-colors text-sm cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Close Sidebar</span>
              </button>
            </div>
          </motion.div>
        )}
          </AnimatePresence>
        </>,
        document.body
      )}

      {/* Vertical tab pinned to the right edge when sidebar is closed */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="flex fixed right-0 top-64 md:top-1/2 md:-translate-y-1/2 z-[9990] bg-primary-600 hover:bg-primary-500 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-l-md py-6 px-2.5 shadow-md flex-col items-center justify-center border border-r-0 border-primary-400/20 cursor-pointer select-none"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          <span className="font-bold tracking-wider text-xs uppercase">Form Tabs</span>
        </button>
      )}

      {/* Floating Action Button (FAB) for Add Question */}
      {editingTab && !isSidebarOpen && (
        <button
          onClick={() => addQuestion(editingTab)}
          className="fixed bottom-6 right-4 md:bottom-8 md:right-8 z-40 flex items-center space-x-2 px-5 py-3.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-semibold shadow-2xl transition-all hover:scale-105 active:scale-95 duration-200 border border-primary-500/30 group cursor-pointer"
          title="Add Question to Current Tab"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
          <span className="text-sm">Add Question</span>
        </button>
      )}

      {showSwarmModal && createPortal(
        <div 
          className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#0A0A0B]/50 backdrop-blur-sm p-4 overscroll-none"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-[#0A0A0B] w-full max-w-[95vw] lg:max-w-[90vw] rounded-2xl shadow-2xl flex flex-col h-[90vh] border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border-b border-[#27272A]/50 shrink-0 gap-4">
              <h3 className="font-semibold text-base text-violet-500 flex items-center gap-2 shrink-0">
                <Sparkles className="w-5 h-5 text-violet-500" />
                <span>AI Swarm Builder {celexId && `- CELEX: ${celexId}`}</span>
                <button 
                  onClick={() => setAutoScrollEnabled(!autoScrollEnabled)} 
                  className={`ml-4 px-2 py-1 rounded text-xs font-semibold shadow-sm transition-colors ${autoScrollEnabled ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-700'}`}
                >
                  {autoScrollEnabled ? 'Scroll: Auto' : 'Scroll: Manual'}
                </button>
              </h3>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
                <SwarmTimer logs={swarmLogs} isBuildingForm={isBuildingForm} serverTimeOffset={serverTimeOffset} />
                {isBuildingForm ? (
                  <button onClick={handleStartSwarm} className="px-3 py-1.5 w-[130px] justify-center rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 transition-all font-semibold text-sm text-white shadow-md shadow-red-500/20 border-none flex items-center gap-2">
                    <X className="w-4 h-4" /> Pause/Stop
                  </button>
                ) : (
                  <>                     {!isBuildingForm && swarmLogs.length > 0 && (
                      <button 
                        onClick={triggerMetaImprovement} 
                        className={`px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 transition-all font-semibold text-sm text-white shadow-md shadow-violet-500/20 border-none flex items-center gap-2 ${(isImprovingMeta || isResuming) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={isImprovingMeta || isResuming}
                      >
                        {isImprovingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                        {isImprovingMeta ? 'Analyzing...' : 'Self Improve'}
                      </button>
                    )}
                    {swarmLogs.length > 0 && (
                      <button 
                        onClick={handleStartSwarm} 
                        disabled={isResuming}
                        className={`px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 transition-all font-semibold text-sm text-white shadow-md shadow-violet-500/20 border-none flex items-center gap-2 ${isResuming ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <RefreshCw className="w-4 h-4" /> Restart
                      </button>
                    )}
                    <button 
                      disabled={isResuming}
                      onClick={async () => {
                        const currentJobId = sessionStorage.getItem('activeSwarmJobId');
                        if (currentJobId && swarmLogs.length > 0) {
                          if (!window.confirm("Warning: The AI form building process is time-consuming as it takes into account real EU regulation documents. As a result, it might generate costs and in some cases might not be successful. Do you want to proceed?")) return;
                          setIsResuming(true);
                          try {
                            const API_BASE_URL = import.meta.env.VITE_API_URL;
                            await fetch(`${API_BASE_URL}/api/resume/${currentJobId}`, { method: 'POST' });
                            pollJob(currentJobId);
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setIsResuming(false);
                          }
                        } else {
                          handleStartSwarm();
                        }
                      }} className={`px-3 py-1.5 w-[130px] justify-center rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all font-semibold text-sm text-white shadow-md shadow-emerald-500/20 border-none flex items-center gap-2 ${isResuming ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <Play className="w-4 h-4" /> {swarmLogs.length > 0 ? 'Resume' : 'Start'}
                    </button>
                  </>
                )}
                <button onClick={handleCopyLogs} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 transition-all font-semibold text-sm text-white shadow-md shadow-violet-500/20 border-none flex items-center gap-2">
                  {copiedLogs ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedLogs ? 'Copied!' : 'Copy Logs'}
                </button>
                <button onClick={() => setExpandAllSwarmLogs(prev => ({level: Math.min(3, prev.level + 1), timestamp: Date.now()}))} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 transition-all font-semibold text-sm text-white shadow-md shadow-violet-500/20 border-none">Expand All</button>
                <button onClick={() => setExpandAllSwarmLogs(prev => ({level: Math.max(0, prev.level - 1), timestamp: Date.now()}))} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 transition-all font-semibold text-sm text-white shadow-md shadow-violet-500/20 border-none">Collapse All</button>
                <button onClick={() => setShowSwarmModal(false)} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 transition-all text-white shadow-md shadow-violet-500/20 flex items-center justify-center border-none">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <SwarmLogViewer logs={swarmLogs} isBuildingForm={isBuildingForm || isImprovingMeta} forceState={expandAllSwarmLogs} autoScrollEnabled={autoScrollEnabled} scrollDuration={isImprovingMeta ? 36000 : 300} />
            {hitlData && (
              <div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-amber-50 dark:bg-amber-900/20 shrink-0">
                <h4 className="font-bold text-amber-800 dark:text-amber-500 mb-2">Human-in-the-Loop Required</h4>
                <p className="text-sm text-amber-700 dark:text-amber-400">{hitlData.message}</p>
                <button 
                  onClick={() => setShowSwarmModal(false)}
                  className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
                >
                  Close & Manually Resolve
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {!showSwarmModal && (
        <QueueWidget pollJob={pollJob} />
      )}
    </div>
  );
};



