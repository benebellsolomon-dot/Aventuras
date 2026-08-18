import importlib.util
s = importlib.util.spec_from_file_location("be", r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py")
be = importlib.util.module_from_spec(s)
s.loader.exec_module(be)
print("tier | cup              | slider | hyper")
print("-" * 44)
for t in [0, 1, 2, 3, 4, 6, 7, 8, 10, 13, 14, 18, 21, 22, 26, 29, 30, 35, 39, 40, 45, 49, 50, 60]:
    print("%4d | %-16s | %+6.2f | %5.2f" % (
        t, be.tier_to_cup_tag(t), be.tier_to_slider_weight(t), be.tier_to_hyper_concept_weight(t)))
