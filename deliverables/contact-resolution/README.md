# Contact-resolution evidence · 本地2026-11-15

入口：index.html。此目录保留真实浏览器截图/JSON，不是概念图。

## 已实际完成

固定16×8m全域，2048×1024 RGBA32F双缓冲，格距7.8125mm；2,123,856表面顶点与状态同cell-centre约定。120Hz命令、每命令5子步，dt=1/600s，CFL=.8，原米制波速与每秒阻尼保持。不是自适应补丁，不重置身后旧波纹。

反冲源的米制支持取实测湿面积，归一使用实际上传栅格中心；解析排水体积加四点Gauss采样，源/传播融合。没有放大石头、法线或任意增益，没有恢复膜管球；石头物理和出手采样不改。

## 实图时序与结论

- early.before/after：.300s，同快照/相机位置/四元数/FOV/光照；石头已经离水，仅检验后方余波，不要求波纹跟着石头。
- last.before/after：.72675s，最后持续接触；sink.before/after：2.04325s，实际物理结束。
- 三组surface-only图独立移除水下床/折射调制，仍可见局部波面；竖直太阳亮带是静态反射，不是水浪。
- wet-active=.26675s、wet-late=.270s实测activeContact0且湿面积>0；exit-trail=.28025s已离水。

独立Designer实际读取细化图：椭圆波纹、短尾迹、离水残留比旧版可读，不只是底纹变细；实际触水时能见石底小暗心/弧边，但凹陷体积感与隆起水脊仍弱。离水尾迹分项通过，整体强烈冲击视觉未通过。线性高度场没有翻卷/腾空水花。最终精度修正后同机位图已刷新，宏观结论未由数值替代。

## 最终验证

- tests.log：85总数，75通过，0失败，10个明确停用的旧渲染器用例。新增7项纯网格/源/时序合同；原物理、出手和快照断言保持。
- typecheck.log/build.log：通过，仍有>500kB包体提示。
- gpu-wet-footprint.json：实际GPU A=.001m²、−.02N·s窄湿区，512/1024/2048宽度支持单元5/18/74；源误差1.21e−9/1.31e−9/9.40e−11N·s，低于原定1e−7阈值。
- 环带h²密度峰.2s半径.465/.495/.505m，后两级差10mm；不是连续误差为零或直接波速标定。
- 完整4秒480命令，正常/.25/.05及不规则RAF分组的GPU所有RGBA状态完全相同。所有program链接，GL_NO_ERROR、shader errors=[]。
- performance.json：最终3秒102帧，约33FPS平均；CPU提交mean2.225/p95 4ms，RAF mean30.039/p95 63/max224ms。7几何/8纹理。没有GPU timer-query，未编GPU毫秒；不能保证稳定60FPS或手机性能。

保留gpu-verification.json/gpu-full-throw.json为此前较宽核的检查；最终真实窄湿区以gpu-wet-footprint.json为准，不混为同一个测试。方法/单位/平均水量误差/初始欠解析/慢放插值局限见../../docs/CONTACT_RESOLUTION.md。可复验脚本../../tools/contact-grid-browser-check.js。未将研究和截图上传公开代码。
