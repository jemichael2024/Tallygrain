"""Export the trained U-Net to ONNX for the browser (ONNX Runtime Web).
Usage: python3 model/export_onnx.py out_dir/unet.pt models/tallygrain-unet.onnx"""
import sys, os, torch
sys.path.insert(0, os.path.dirname(__file__))
from train import UNet
m = UNet(16); m.load_state_dict(torch.load(sys.argv[1], map_location='cpu')); m.eval()
class WithSigmoid(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, x): return torch.sigmoid(s.m(x))
torch.onnx.export(WithSigmoid(m), torch.zeros(1, 1, 256, 256), sys.argv[2], input_names=['image'], output_names=['prob'],
                  dynamic_axes={'image': {2: 'h', 3: 'w'}, 'prob': {2: 'h', 3: 'w'}}, opset_version=17, dynamo=False)
print('wrote', sys.argv[2], os.path.getsize(sys.argv[2]) // 1024, 'KB')
