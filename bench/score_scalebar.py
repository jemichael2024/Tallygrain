"""Score bench/eval_scalebar.js output. Ground truth: commercial Au (bar nm and px from the source repo's
metadata), app samples, and labels read by eye for PSDI val and NanoAnalyzer (bar px for those not checked).
Usage: python3 bench/score_scalebar.py RESULTS_JSON TRUTH_JSON  (TRUTH_JSON: {name: {nm, px, src}})"""
import json, sys
r=json.load(open(sys.argv[1])); T=json.load(open(sys.argv[2]))
lab={'na_A_sample_0001_1k':50,'na_E_sample_0003_1k':20,'na_E_sample_0007_1k':20,'na_E_sample_0008_1k':50,'na_L_sample_0001_1k':200,'na_L_sample_0002_1k':200,'na_L_sample_0003_1k':200,'na_L_sample_0004_1k':100,'na_L_sample_0005_1k':100,'na_U_sample_0013':None,'na_W_sample_0011_1k':20,'na_Y_sample_0003_1k':None,'na_Y_sample_0005_1k':None,
 'psdi_L1-1-D':100,'psdi_L1-3-B':100,'psdi_L1-3-C':100,'psdi_L1-3-D':100,'psdi_L1-4-C':100,'psdi_L1-4-D':50,'psdi_L2-1-D':50,'psdi_L2-11-2-A':100,'psdi_L2-12-2-D':100,'psdi_L2-2-D':50,'psdi_L2-3-B':100,
 'psdi_L3-elite-3-A':200,'psdi_L3-elite-3-B':200,'psdi_L3-elite-3-C':200,'psdi_L3-elite-3-D':100,'psdi_L3-elite-4-D':100,'psdi_L3-elite-5-D':100,'psdi_L3-elite-9-C':100,
 'psdi_octahedra_opt_solution_1_A':200,'psdi_octahedra_opt_solution_1_B':100,'psdi_octahedra_opt_solution_1_C':100,'psdi_octahedra_opt_solution_1_D':100,'psdi_octahedra_opt_solution_2_B':100,'psdi_octahedra_opt_solution_3_D':100}
for k in ['na_1_285kx','na_2_285kx','na_3_285kx','na_4-285kx','na_5','na_6','na_7','s_jeol_haadf','s_sio2_haadf']: lab[k]='none'
for k,v in T.items():
  if v['src'] in('au','sample') and v['nm']: lab[k]=v['nm']
stats={}
rows=[]
for k,truth in lab.items():
  src=k.split('_')[0]; x=r[k]; L=x['label']; b=x['bar']
  if truth=='none': res='correct-none' if not L else 'WRONG-fill'
  elif truth is None: res='unverified'
  else:
    if not L: res='no-fill'
    else:
      okL=abs(L['nm']-truth*(1000 if False else 1))<1e-6 or abs(L['nm']-truth)<1e-6
      tp=T[k]['px'] if T[k]['px'] not in ('?',None) else None
      okP = (abs(b['len']-tp)/tp<0.02) if tp else True
      res='correct' if okL and okP else 'WRONG-fill'
  s=stats.setdefault(src,{}); s[res]=s.get(res,0)+1; rows.append((k,truth,L and L['value'],L and L['unit'],res))
for k,t,v,u,res in rows:
  if res!='correct' and res!='correct-none': print(k,t,v,u,res)
print(json.dumps(stats,indent=0))
