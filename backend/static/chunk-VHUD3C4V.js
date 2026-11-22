import{b as k,c as w,i as c,l as C}from"./chunk-QYEQI4EQ.js";import{T,ua as N}from"./chunk-2KYWLR7J.js";import{d as F}from"./chunk-2325T7AW.js";import{Ac as n,Db as I,Gc as o,M as v,N as x,P as m,R as r,Sb as M,Za as h,_a as u,ab as b,bb as l,gc as D,ha as s,ib as y,ja as g,la as a,wc as p}from"./chunk-PG6J5NCR.js";var f=(()=>{class t extends w{modelValue=s(void 0);$filled=p(()=>T(this.modelValue()));writeModelValue(e){this.modelValue.set(e)}static \u0275fac=(()=>{let e;return function(d){return(e||(e=a(t)))(d||t)}})();static \u0275dir=u({type:t,features:[l]})}return t})();var V=`
    .p-inputtext {
        font-family: inherit;
        font-feature-settings: inherit;
        font-size: 1rem;
        color: dt('inputtext.color');
        background: dt('inputtext.background');
        padding-block: dt('inputtext.padding.y');
        padding-inline: dt('inputtext.padding.x');
        border: 1px solid dt('inputtext.border.color');
        transition:
            background dt('inputtext.transition.duration'),
            color dt('inputtext.transition.duration'),
            border-color dt('inputtext.transition.duration'),
            outline-color dt('inputtext.transition.duration'),
            box-shadow dt('inputtext.transition.duration');
        appearance: none;
        border-radius: dt('inputtext.border.radius');
        outline-color: transparent;
        box-shadow: dt('inputtext.shadow');
    }

    .p-inputtext:enabled:hover {
        border-color: dt('inputtext.hover.border.color');
    }

    .p-inputtext:enabled:focus {
        border-color: dt('inputtext.focus.border.color');
        box-shadow: dt('inputtext.focus.ring.shadow');
        outline: dt('inputtext.focus.ring.width') dt('inputtext.focus.ring.style') dt('inputtext.focus.ring.color');
        outline-offset: dt('inputtext.focus.ring.offset');
    }

    .p-inputtext.p-invalid {
        border-color: dt('inputtext.invalid.border.color');
    }

    .p-inputtext.p-variant-filled {
        background: dt('inputtext.filled.background');
    }

    .p-inputtext.p-variant-filled:enabled:hover {
        background: dt('inputtext.filled.hover.background');
    }

    .p-inputtext.p-variant-filled:enabled:focus {
        background: dt('inputtext.filled.focus.background');
    }

    .p-inputtext:disabled {
        opacity: 1;
        background: dt('inputtext.disabled.background');
        color: dt('inputtext.disabled.color');
    }

    .p-inputtext::placeholder {
        color: dt('inputtext.placeholder.color');
    }

    .p-inputtext.p-invalid::placeholder {
        color: dt('inputtext.invalid.placeholder.color');
    }

    .p-inputtext-sm {
        font-size: dt('inputtext.sm.font.size');
        padding-block: dt('inputtext.sm.padding.y');
        padding-inline: dt('inputtext.sm.padding.x');
    }

    .p-inputtext-lg {
        font-size: dt('inputtext.lg.font.size');
        padding-block: dt('inputtext.lg.padding.y');
        padding-inline: dt('inputtext.lg.padding.x');
    }

    .p-inputtext-fluid {
        width: 100%;
    }
`;var P=`
    ${V}

    /* For PrimeNG */
   .p-inputtext.ng-invalid.ng-dirty {
        border-color: dt('inputtext.invalid.border.color');
    }

    .p-inputtext.ng-invalid.ng-dirty::placeholder {
        color: dt('inputtext.invalid.placeholder.color');
    }
`,z={root:({instance:t})=>["p-inputtext p-component",{"p-filled":t.$filled(),"p-inputtext-sm":t.pSize==="small","p-inputtext-lg":t.pSize==="large","p-invalid":t.invalid(),"p-variant-filled":t.$variant()==="filled","p-inputtext-fluid":t.hasFluid}]},B=(()=>{class t extends N{name="inputtext";style=P;classes=z;static \u0275fac=(()=>{let e;return function(d){return(e||(e=a(t)))(d||t)}})();static \u0275prov=v({token:t,factory:t.\u0275fac})}return t})();var E=new m("INPUTTEXT_INSTANCE"),it=(()=>{class t extends f{componentName="InputText";hostName="";ptInputText=n();pInputTextPT=n();pInputTextUnstyled=n();bindDirectiveInstance=r(c,{self:!0});$pcInputText=r(E,{optional:!0,skipSelf:!0})??void 0;ngControl=r(F,{optional:!0,self:!0});pcFluid=r(C,{optional:!0,host:!0,skipSelf:!0});pSize;variant=n();fluid=n(void 0,{transform:o});invalid=n(void 0,{transform:o});$variant=p(()=>this.variant()||this.config.inputStyle()||this.config.inputVariant());_componentStyle=r(B);constructor(){super(),g(()=>{let e=this.ptInputText()||this.pInputTextPT();e&&this.directivePT.set(e)}),g(()=>{this.pInputTextUnstyled()&&this.directiveUnstyled.set(this.pInputTextUnstyled())})}onAfterViewInit(){this.writeModelValue(this.ngControl?.value??this.el.nativeElement.value),this.cd.detectChanges()}onAfterViewChecked(){this.bindDirectiveInstance.setAttrs(this.ptm("root"))}onDoCheck(){this.writeModelValue(this.ngControl?.value??this.el.nativeElement.value)}onInput(){this.writeModelValue(this.ngControl?.value??this.el.nativeElement.value)}get hasFluid(){return this.fluid()??!!this.pcFluid}get dataP(){return this.cn({invalid:this.invalid(),fluid:this.hasFluid,filled:this.$variant()==="filled",[this.pSize]:this.pSize})}static \u0275fac=function(i){return new(i||t)};static \u0275dir=u({type:t,selectors:[["","pInputText",""]],hostVars:3,hostBindings:function(i,d){i&1&&I("input",function(){return d.onInput()}),i&2&&(y("data-p",d.dataP),M(d.cx("root")))},inputs:{hostName:"hostName",ptInputText:[1,"ptInputText"],pInputTextPT:[1,"pInputTextPT"],pInputTextUnstyled:[1,"pInputTextUnstyled"],pSize:"pSize",variant:[1,"variant"],fluid:[1,"fluid"],invalid:[1,"invalid"]},features:[D([B,{provide:E,useExisting:t},{provide:k,useExisting:t}]),b([c]),l]})}return t})(),dt=(()=>{class t{static \u0275fac=function(i){return new(i||t)};static \u0275mod=h({type:t});static \u0275inj=x({})}return t})();var lt=(()=>{class t extends f{required=n(void 0,{transform:o});invalid=n(void 0,{transform:o});disabled=n(void 0,{transform:o});name=n();_disabled=s(!1);$disabled=p(()=>this.disabled()||this._disabled());onModelChange=()=>{};onModelTouched=()=>{};writeDisabledState(e){this._disabled.set(e)}writeControlValue(e,i){}writeValue(e){this.writeControlValue(e,this.writeModelValue.bind(this))}registerOnChange(e){this.onModelChange=e}registerOnTouched(e){this.onModelTouched=e}setDisabledState(e){this.writeDisabledState(e),this.cd.markForCheck()}static \u0275fac=(()=>{let e;return function(d){return(e||(e=a(t)))(d||t)}})();static \u0275dir=u({type:t,inputs:{required:[1,"required"],invalid:[1,"invalid"],disabled:[1,"disabled"],name:[1,"name"]},features:[l]})}return t})();export{it as a,dt as b,lt as c};
